import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_GOVERNMENT_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import { type TaxOverviewExtDto, MoneySchema } from '@efls/contracts';
import { taxRepository } from './tax.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

/** Thuế suất lũy tiến tham khảo (áp dụng trần 20%). */
const TAX_RATE = 0.1;

/** Dịch vụ thuế: đánh thuế, kiểm toán, tố giác, thu hồi giấy phép. */
export class TaxService {
  constructor(private readonly repository = taxRepository) {}

  async getOverview(
    userId: string,
    dbOverride?: Parameters<typeof this.repository.listAssessments>[1],
  ): Promise<TaxOverviewExtDto> {
    const db = dbOverride ?? this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const [assessments, audits, licenses] = await Promise.all([
      this.repository.listAssessments(character.id, db),
      this.repository.listAudits(character.id, db),
      this.repository.listLicenses(character.id, db),
    ]);

    const totalDue = assessments
      .filter((a) => a.status === 'due')
      .reduce((sum, a) => sum + Number(a.taxDueMinor), 0);
    const currentYear = new Date().getFullYear();
    const latestAudit = audits[0];
    const auditRisk = latestAudit?.riskScore ?? this.computeRisk(character.heat_level, 0, 0);
    const audited = (latestAudit?.status ?? 'none') !== 'open';

    return {
      assessments: assessments.map((a) => ({
        id: a.id,
        taxYear: a.taxYear,
        taxableIncome: money(Number(a.taxableIncomeMinor)),
        taxDue: money(Number(a.taxDueMinor)),
        status: a.status as 'due' | 'paid' | 'delinquent',
        dueAt: a.dueAt.toISOString(),
        paidAt: a.paidAt?.toISOString() ?? null,
      })),
      totalDue: money(totalDue),
      currentYear,
      auditRisk,
      audited,
      audits: audits.map((a) => ({
        id: a.id,
        taxYear: a.taxYear,
        riskScore: a.riskScore,
        status: a.status as 'open' | 'cleared' | 'penalized',
        penalty: money(Number(a.penaltyMinor)),
        createdAt: a.createdAt.toISOString(),
      })),
      licenses: licenses.map((l) => ({
        id: l.id,
        companyId: l.companyId,
        licenseType: l.licenseType,
        status: l.status as 'active' | 'suspended' | 'revoked',
        issuedAt: l.issuedAt.toISOString(),
        revokedAt: l.revokedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Tính thuế năm từ tiền mặt hiện có (hệ số 10%). */
  async assess(userId: string, taxYear: number): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const taxable = toMinor(character.cash_minor);
      if (taxable <= 0) {
        throw AppError.badRequest('Không có thu nhập chịu thuế (tiền mặt = 0).');
      }
      const taxDue = Math.round(taxable * TAX_RATE);
      const assessmentId = await this.repository.createAssessment(
        client,
        character.id,
        taxYear,
        taxable,
        taxDue,
      );
      await notify(client, {
        userId,
        kind: 'tax',
        title: 'Đánh thuế',
        body: `Khoản thuế năm ${taxYear}: ${taxDue} VND trên thu nhập ${taxable} VND.`,
        payload: { assessmentId, taxYear, taxable, taxDue },
      });
      return this.getOverview(userId, client);
    });
  }

  /** Nộp thuế cho một khoản đã đánh giá. */
  async pay(userId: string, assessmentId: string): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const assessment = await this.repository.getAssessment(assessmentId, client);
      if (!assessment) throw AppError.notFound('Tax assessment');
      if (assessment.status !== 'due') {
        throw AppError.badRequest('Khoản thuế đã được nộp hoặc hết hiệu lực.');
      }
      const due = Number(assessment.taxDueMinor);
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < due) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền nộp thuế.');
      }
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID },
        amountMinor: due,
        kind: 'tax_payment',
        description: `Nộp thuế năm ${assessment.taxYear}`,
        referenceType: 'tax_assessment',
        referenceId: assessmentId,
      });
      await this.repository.markPaid(client, assessmentId);
      await notify(client, {
        userId,
        kind: 'tax',
        title: 'Nộp thuế thành công',
        body: `Đã nộp ${due} VND thuế năm ${assessment.taxYear}.`,
        payload: { assessmentId, due },
      });
      return this.getOverview(userId, client);
    });
  }

  /**
   * Mở kiểm toán thuế: rủi ro = heat + nợ thuế quá hạn.
   * Nếu risk >= 60: bị phạt 10% tổng nợ thuế (tối thiểu 1 triệu).
   */
  async startAudit(userId: string, taxYear: number): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const audits = await this.repository.listAudits(character.id, client);
      if (audits.some((a) => a.status === 'open')) {
        throw AppError.conflict('audit_open', 'Đang có một cuộc kiểm toán đang mở.');
      }
      const assessments = await this.repository.listAssessments(character.id, client);
      const delinquentCount = assessments.filter((a) => a.status === 'delinquent').length;
      const dueTotal = assessments
        .filter((a) => a.status === 'due')
        .reduce((sum, a) => sum + Number(a.taxDueMinor), 0);
      const riskScore = this.computeRisk(character.heat_level, delinquentCount, dueTotal);
      const auditId = await this.repository.createAudit(client, character.id, taxYear, riskScore);

      let penalty = 0;
      let status: 'cleared' | 'penalized' = 'cleared';
      if (riskScore >= 60 && dueTotal > 0) {
        status = 'penalized';
        penalty = Math.max(1_000_000, Math.round(dueTotal * 0.1));
        const balance = await ledger.getBalance(client, 'character', character.id);
        const payable = Math.min(penalty, balance);
        if (payable > 0) {
          await ledger.transfer(client, {
            from: { ownerType: 'character', ownerId: character.id },
            to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID },
            amountMinor: payable,
            kind: 'tax_penalty',
            description: `Phạt kiểm toán năm ${taxYear}`,
            referenceType: 'tax_audit',
            referenceId: auditId,
          });
        }
        await client.query(
          `UPDATE characters
           SET heat_level = LEAST(100, heat_level + 8), updated_at = now()
           WHERE id = $1`,
          [character.id],
        );
      }
      await this.repository.resolveAudit(client, auditId, status, penalty);

      await notify(client, {
        userId,
        kind: 'tax',
        title: status === 'penalized' ? 'Kiểm toán: bị phạt' : 'Kiểm toán: đã cleared',
        body:
          status === 'penalized'
            ? `Rủi ro kiểm toán ${riskScore}/100, phạt ${penalty} VND.`
            : `Rủi ro kiểm toán ${riskScore}/100, không có vấn đề.`,
        payload: { auditId, taxYear, riskScore, status, penalty },
      });
      return this.getOverview(userId, client);
    });
  }

  /**
   * Tố giác một nhân vật: tạo vụ án hình sự cho người bị tố giác,
   * tăng rủi ro kiểm toán của người tố giác? Thực tế: tăng heat của target,
   * và tạo thông báo cho cả hai bên.
   */
  async report(userId: string, targetCharacterId: string, reason: string): Promise<void> {
    await withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      if (targetCharacterId === character.id) {
        throw AppError.badRequest('Không thể tự tố giác.');
      }
      const target = await client.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM characters WHERE id = $1`,
        [targetCharacterId],
      );
      if (!target.rows[0]) throw AppError.notFound('Target character');

      await client.query(
        `UPDATE characters
         SET heat_level = LEAST(100, heat_level + 3), updated_at = now()
         WHERE id = $1`,
        [targetCharacterId],
      );

      await notify(client, {
        userId,
        kind: 'tax',
        title: 'Đã tố giác',
        body: `Tố giác của bạn đã được gửi tới cơ quan chức năng.`,
        payload: { targetCharacterId, reason },
      });
      await notify(client, {
        userId: target.rows[0].user_id,
        kind: 'law',
        title: 'Bạn bị tố giác',
        body: `Bạn bị tố giác vì lý do: ${reason}`,
        payload: { reporterId: character.id, reason },
      });
    });
  }

  /** Thu hồi giấy phép kinh doanh (hủy giấy phép công ty). */
  async revokeLicense(userId: string, licenseId: string): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const license = await this.repository.getLicense(licenseId, client);
      if (!license) throw AppError.notFound('Business license');
      const company = await client.query<{ owner_character_id: string }>(
        `SELECT owner_character_id FROM companies WHERE id = $1`,
        [license.companyId],
      );
      if (!company.rows[0]) throw AppError.notFound('Company');
      if (company.rows[0].owner_character_id !== character.id) {
        throw AppError.forbidden('Chỉ chủ công ty mới được hủy giấy phép của mình.');
      }
      if (license.status === 'revoked') {
        throw AppError.badRequest('Giấy phép đã bị hủy.');
      }
      await this.repository.revokeLicense(client, licenseId);
      await notify(client, {
        userId,
        kind: 'tax',
        title: 'Hủy giấy phép',
        body: `Giấy phép ${license.licenseType} (công ty ${license.companyId}) đã bị hủy.`,
        payload: { licenseId, companyId: license.companyId },
      });
      return this.getOverview(userId, client);
    });
  }

  private computeRisk(heatLevel: number, delinquentCount: number, dueTotal: number): number {
    let risk = heatLevel * 0.5 + delinquentCount * 15 + Math.min(30, dueTotal / 1_000_000);
    risk = Math.min(100, Math.max(0, Math.round(risk)));
    return risk;
  }
}

export const taxService = new TaxService();
