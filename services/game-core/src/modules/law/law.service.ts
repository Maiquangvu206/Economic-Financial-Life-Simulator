import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_GOVERNMENT_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import {
  type CourtCaseDto,
  type LawOverviewExtDto,
  type TrialDto,
  type EvidenceDto,
  MoneySchema,
} from '@efls/contracts';
import { lawRepository } from './law.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

/** Mức phạt cơ bản (VNĐ) theo loại tội, trước khi scale theo độ nặng bằng chứng. */
const BASE_FINE: Record<string, number> = {
  tax_evasion: 50_000_000,
  money_laundering: 100_000_000,
  fraud: 80_000_000,
  forgery: 30_000_000,
  blackmail: 40_000_000,
  heist: 120_000_000,
  sabotage: 60_000_000,
  assault: 20_000_000,
};

const BASE_PRISON_DAYS: Record<string, number> = {
  tax_evasion: 30,
  money_laundering: 90,
  fraud: 60,
  forgery: 15,
  blackmail: 30,
  heist: 180,
  sabotage: 45,
  assault: 10,
};

/** Ngưỡng bằng chứng để xác nhận tội (rule cứng). */
const EVIDENCE_GUILTY_THRESHOLD = 60;

/**
 * Dịch vụ pháp lý: tòa án + AI thẩm phán (proposal), bằng chứng, án tích.
 *
 * AI chỉ đưa đề xuất (proposal). Core áp rule cứng + bằng chứng để chốt
 * bản án cuối cùng, ghi vào criminal_records và trừ phạt qua ledger.
 */
export class LawService {
  constructor(private readonly repository = lawRepository) {}

  async getOverview(userId: string): Promise<LawOverviewExtDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const [cases, records, blackmails] = await Promise.all([
      this.repository.listCases(character.id),
      this.repository.listCriminalRecords(character.id),
      this.repository.listBlackmails(character.id),
    ]);

    const evidences: EvidenceDto[] = [];
    for (const c of cases) {
      const list = await this.repository.listEvidences(c.id);
      for (const e of list) {
        evidences.push({
          id: e.id,
          caseId: e.caseId,
          submittedById: e.submittedById,
          strength: e.strength,
          description: e.description,
          createdAt: e.createdAt.toISOString(),
        });
      }
    }

    return {
      courtCases: cases.map((c) => this.toCaseDto(c)),
      criminalRecords: records.map((r) => ({
        id: r.id,
        crimeType: r.crimeType as CourtCaseDto['crimeType'],
        fine: money(Number(r.fineMinor)),
        prisonDays: r.prisonDays,
        convictedAt: r.convictedAt.toISOString(),
      })),
      blackmailContracts: blackmails.map((b) => ({
        id: b.id,
        blackmailerId: b.blackmailerId,
        targetId: b.targetId,
        monthlyPayment: money(Number(b.monthlyPaymentMinor)),
        status: b.status as 'active' | 'ended' | 'exposed',
        expiresAt: b.expiresAt?.toISOString() ?? null,
      })),
      heatLevel: character.heat_level,
      evidences,
    };
  }

  /** Mở vụ án mới cho chính mình (tự nguyện) hoặc cho nhân vật bị báo cáo. */
  async openCase(userId: string, crimeType: string): Promise<CourtCaseDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const caseId = await this.repository.createCase(client, character.id, crimeType);
      const row = await this.repository.getCase(caseId, client);
      if (!row) throw new Error('Case disappeared after creation');
      await notify(client, {
        userId,
        kind: 'law',
        title: 'Mở vụ án',
        body: `Một vụ án mới về tội ${crimeType} đã được mở.`,
        payload: { caseId, crimeType },
      });
      return this.toCaseDto(row);
    });
  }

  /** Nộp bằng chứng cho một vụ án. */
  async submitEvidence(
    userId: string,
    caseId: string,
    strength: number,
    description: string,
  ): Promise<EvidenceDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const courtCase = await this.repository.getCase(caseId, client);
      if (!courtCase) throw AppError.notFound('Court case');
      if (courtCase.status === 'closed') {
        throw AppError.badRequest('Vụ án đã đóng, không thể nộp thêm bằng chứng.');
      }
      const evidence = await this.repository.addEvidence(
        client,
        caseId,
        character.id,
        strength,
        description,
      );
      await this.repository.bumpEvidenceStrength(client, caseId, strength);
      await notify(client, {
        userId,
        kind: 'law',
        title: 'Nộp bằng chứng',
        body: `Bằng chứng (độ mạnh ${strength}) đã nộp cho vụ án ${caseId}.`,
        payload: { caseId, evidenceId: evidence.id, strength },
      });
      return {
        id: evidence.id,
        caseId: evidence.caseId,
        submittedById: evidence.submittedById,
        strength: evidence.strength,
        description: evidence.description,
        createdAt: evidence.createdAt.toISOString(),
      };
    });
  }

  /**
   * Xét xử: AI thẩm phán đưa proposal, core kiểm tra bằng chứng + rule
   * để chốt bản án. Ghi án tích, trừ phạt qua ledger, tăng heat.
   */
  async trial(userId: string, caseId: string): Promise<TrialDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const courtCase = await this.repository.getCase(caseId, client);
      if (!courtCase) throw AppError.notFound('Court case');
      if (courtCase.status === 'closed') {
        throw AppError.badRequest('Vụ án đã đóng.');
      }
      if (courtCase.defendantId !== character.id) {
        throw AppError.forbidden('Chỉ bị cáo mới có thể yêu cầu xét xử.');
      }

      const strength = courtCase.evidenceStrength;

      // AI thẩm phán (proposal) — mô phỏng bằng rule mờ theo độ mạnh bằng chứng.
      // Core luôn kiểm tra lại bằng ngưỡng cứng, nên AI không thể vượt luật.
      const aiProposal: 'guilty' | 'not_guilty' = strength >= 40 ? 'guilty' : 'not_guilty';
      const finalVerdict: 'guilty' | 'not_guilty' =
        strength >= EVIDENCE_GUILTY_THRESHOLD ? 'guilty' : 'not_guilty';
      const reason =
        aiProposal !== finalVerdict
          ? `AI đề xuất ${aiProposal} nhưng bằng chứng ${strength}/100 dưới ngưỡng ${EVIDENCE_GUILTY_THRESHOLD} nên tuyên vô tội.`
          : finalVerdict === 'guilty'
            ? `Bằng chứng vững chắc ${strength}/100, xác nhận hành vi phạm tội.`
            : `Bằng chứng chưa đủ ${strength}/100, tuyên vô tội.`;

      let fineMinor = 0;
      let prisonDays = 0;
      if (finalVerdict === 'guilty') {
        const baseFine = BASE_FINE[courtCase.crimeType] ?? 10_000_000;
        const baseDays = BASE_PRISON_DAYS[courtCase.crimeType] ?? 15;
        fineMinor = Math.round((baseFine * strength) / 100);
        prisonDays = Math.round((baseDays * strength) / 100);

        const balance = await ledger.getBalance(client, 'character', character.id);
        const payable = Math.min(fineMinor, balance);
        if (payable > 0) {
          await ledger.transfer(client, {
            from: { ownerType: 'character', ownerId: character.id },
            to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID },
            amountMinor: payable,
            kind: 'court_fine',
            description: `Phạt tòa án vụ ${caseId}`,
            referenceType: 'court_case',
            referenceId: caseId,
          });
        }
        await this.repository.insertCriminalRecord(
          client,
          character.id,
          courtCase.crimeType,
          fineMinor,
          prisonDays,
        );
        await client.query(
          `UPDATE characters
           SET heat_level = LEAST(100, heat_level + 5), updated_at = now()
           WHERE id = $1`,
          [character.id],
        );
      }

      await this.repository.closeCase(client, caseId, finalVerdict, fineMinor, prisonDays);

      await notify(client, {
        userId,
        kind: 'law',
        title: finalVerdict === 'guilty' ? 'Bản án: Có tội' : 'Bản án: Vô tội',
        body: reason,
        payload: { caseId, aiProposal, finalVerdict, fineMinor, prisonDays },
      });

      return {
        caseId,
        aiProposal,
        finalVerdict,
        reason,
        fine: money(fineMinor),
        prisonDays,
        evidenceStrength: strength,
      };
    });
  }

  private toCaseDto(
    row: Awaited<ReturnType<typeof lawRepository.listCases>>[number],
  ): CourtCaseDto {
    return {
      id: row.id,
      defendantId: row.defendantId,
      crimeType: row.crimeType as CourtCaseDto['crimeType'],
      evidenceStrength: row.evidenceStrength,
      status: row.status as CourtCaseDto['status'],
      verdict: row.verdict as CourtCaseDto['verdict'],
      fine: money(Number(row.fineMinor)),
      prisonDays: row.prisonDays,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export const lawService = new LawService();
