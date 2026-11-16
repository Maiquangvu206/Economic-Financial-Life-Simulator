import { candidateScore, electionWinner } from '@efls/domain';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction, type Db } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_GOVERNMENT_ID } from '../../shared/ledger/ledger.service.js';
import { creditStateFund, debitStateFund, getStateFundBalance } from '../../shared/state-fund/stateFund.js';
import { resolveSupportTargets, supportCompaniesFromStateFund } from '../../shared/state-fund/supportCompanies.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';
import { notify } from '../notifications/notification.service.js';
import { publishToUser, publishToAllUsers } from '../../shared/realtime/publish.js';
import { writeActionLog } from '../../shared/audit/actionLog.js';
import { pool } from '../../shared/db/pool.js';
import {
  type PoliticsOverviewDto,
  type CandidateDto,
  type ElectionDto,
  type MayorConfigDto,
  type MayorStateDto,
  type MayorPolicyActionRequest,
  MoneySchema,
} from '@efls/contracts';
import { politicsRepository } from './politics.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

const CAMPAIGN_FEE = 5_000_000;

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizeMayorConfig(raw: any): MayorConfigDto {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: d.enabled !== false,
    termDays: clampInt(Number(d.termDays ?? 7), 1, 365),
    salaryMinor: clampInt(Number(d.salaryMinor ?? 2_000_000), 0, 1_000_000_000),
    salaryIntervalGameDays: clampInt(Number(d.salaryIntervalGameDays ?? 1), 1, 30),
    perkTaxDiscountPct: clampInt(Number(d.perkTaxDiscountPct ?? 5), 0, 100),
    policyCooldownMinutes: clampInt(Number(d.policyCooldownMinutes ?? 30), 0, 1440),
    policyCostMinor: clampInt(Number(d.policyCostMinor ?? 1_000_000), 0, 1_000_000_000),
    treasurySpendLimitMinor: clampInt(Number(d.treasurySpendLimitMinor ?? 50_000_000), 0, 10_000_000_000),
    otRateAdjustMinPct: clampInt(Number(d.otRateAdjustMinPct ?? 100), 0, 1000),
    otRateAdjustMaxPct: clampInt(Number(d.otRateAdjustMaxPct ?? 500), 0, 1000),
    otRateAdjustStepPct: clampInt(Number(d.otRateAdjustStepPct ?? 10), 1, 100),
    welfareBonusPerCitizenMinor: clampInt(Number(d.welfareBonusPerCitizenMinor ?? 50_000), 0, 100_000_000),
    welfareBonusMaxCitizens: clampInt(Number(d.welfareBonusMaxCitizens ?? 200), 0, 2000),
  };
}

async function getMayorConfig(db: Db): Promise<MayorConfigDto> {
  const r = await db.query(`SELECT macro FROM game_state WHERE id = 1`);
  const macro = (r.rows[0]?.macro && typeof r.rows[0].macro === 'object') ? r.rows[0].macro : {};
  return normalizeMayorConfig((macro as any).mayor);
}

/** Dịch vụ chính trị & bầu cử Thị trưởng (3 pha): bầu cử, nhiệm kỳ/quyền lợi, chính sách/quỹ, thu hồi tư cách. */
export class PoliticsService {
  constructor(private readonly repository = politicsRepository) {}

  async getOverview(userId: string, dbOverride?: Db): Promise<PoliticsOverviewDto> {
    const db = dbOverride ?? this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const electionRow =
      (await this.repository.getCurrentElection(db)) ?? (await this.repository.latestElection(db));
    const [activeMayor, config] = await Promise.all([
      this.repository.getActiveMayor(db),
      getMayorConfig(db),
    ]);
    const mayor: MayorStateDto | null = activeMayor ? {
      active: true,
      electionId: activeMayor.electionId,
      characterId: activeMayor.characterId,
      characterName: activeMayor.characterName,
      userId: activeMayor.userId,
      termStatus: (activeMayor.termStatus as any) ?? 'active',
      termStartedAt: activeMayor.termStartedAt ? activeMayor.termStartedAt.toISOString() : null,
      termEndsAt: activeMayor.termEndsAt ? activeMayor.termEndsAt.toISOString() : null,
      revokedAt: activeMayor.revokedAt ? activeMayor.revokedAt.toISOString() : null,
      revokedReason: activeMayor.revokedReason ?? null,
      isYou: activeMayor.characterId === character.id,
      config,
    } : {
      active: false,
      electionId: null,
      characterId: null,
      characterName: null,
      userId: null,
      termStatus: 'none',
      termStartedAt: null,
      termEndsAt: null,
      revokedAt: null,
      revokedReason: null,
      isYou: false,
      config,
    };

    if (!electionRow) {
      return { election: null, candidates: [], mayor };
    }
    const [candidates, voted] = await Promise.all([
      this.repository.listCandidates(electionRow.id, db),
      this.repository.hasVoted(electionRow.id, character.id, db),
    ]);
    const myCandidate = candidates.find((c) => c.characterId === character.id);
    const election: ElectionDto = {
      id: electionRow.id,
      office: electionRow.office as 'mayor',
      status: electionRow.status as 'open' | 'ended',
      startsAt: electionRow.startsAt.toISOString(),
      endsAt: electionRow.endsAt.toISOString(),
      winnerCandidateId: electionRow.winnerCandidateId,
      youVoted: voted,
      youCandidateId: myCandidate?.id ?? null,
      winnerCharacterId: electionRow.winnerCharacterId ?? null,
      winnerCharacterName: (electionRow as any).winnerCharacterName ?? null,
      termDays: electionRow.termDays ?? null,
      termStartedAt: electionRow.termStartedAt ? electionRow.termStartedAt.toISOString() : null,
      termEndsAt: electionRow.termEndsAt ? electionRow.termEndsAt.toISOString() : null,
      termStatus: ((electionRow.termStatus as any) ?? 'none'),
      revokedAt: electionRow.revokedAt ? electionRow.revokedAt.toISOString() : null,
      revokedReason: electionRow.revokedReason ?? null,
    };
    return {
      election,
      candidates: candidates.map((c) => this.toCandidateDto(c, character.id)),
      mayor,
    };
  }

  async getMayorState(userId: string): Promise<MayorStateDto> {
    const ov = await this.getOverview(userId);
    return ov.mayor!;
  }

  async createElection(userId: string, endsAt?: Date, termDays?: number): Promise<ElectionDto> {
    return withTransaction(async (client) => {
      await requireLivingCharacterByUserId(client, userId);
      const open = await this.repository.getCurrentElection(client);
      if (open) {
        throw AppError.conflict('election_open', 'Đã có cuộc bầu cử đang mở.');
      }
      const config = await getMayorConfig(client as any);
      const election = await this.repository.createElection(
        client,
        endsAt ?? new Date(Date.now() + 7 * 24 * 3600_000),
        termDays ?? config.termDays,
      );
      await enqueueDomainEvent(client as any, {
        type: 'election.started.v1',
        aggregateType: 'election',
        aggregateId: election.id,
        payload: { electionId: election.id, office: 'mayor' },
      });
      await notify(client as any, {
        userId,
        kind: 'politics',
        title: 'Bầu cử Thị trưởng đã mở',
        body: `Cuộc bầu cử chính thức bắt đầu, kết thúc ${election.endsAt.toISOString()}.`,
        payload: { electionId: election.id },
      });
      const overview = await this.getOverview(userId, client);
      return overview.election!;
    });
  }

  async declareCandidacy(userId: string, electionId: string, name: string): Promise<CandidateDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const election = await this.repository.getElection(electionId, client);
      if (!election) throw AppError.notFound('Election');
      if (election.status !== 'open') {
        throw AppError.badRequest('Cuộc bầu cử đã kết thúc.');
      }
      const balance = await ledger.getBalance(client as any, 'character', character.id);
      if (balance < CAMPAIGN_FEE) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền phí tranh cử (5.000.000 ₫).');
      }
      await creditStateFund(
        client as any,
        { ownerType: 'character', ownerId: character.id, kind: 'cash' },
        CAMPAIGN_FEE,
        {
          amountMinor: CAMPAIGN_FEE,
          reasonCode: 'campaign_fee',
          description: 'Phí tranh cử Thị trưởng vào quỹ đất nước',
          refType: 'election',
          refId: electionId,
          actorType: 'character',
          actorId: character.id,
          ledgerKind: 'campaign_fee',
          ledgerDescription: 'Phí tranh cử Thị trưởng',
        },
      );
      const candidateId = await this.repository.declareCandidacy(
        client,
        electionId,
        character.id,
        name || character.full_name,
      );
      await enqueueDomainEvent(client as any, {
        type: 'election.candidacy.v1',
        aggregateType: 'election',
        aggregateId: electionId,
        payload: { electionId, candidateId, characterId: character.id },
      });
      await notify(client as any, {
        userId,
        kind: 'politics',
        title: 'Đã ứng cử',
        body: `Bạn đã ứng cử Thị trưởng với tên "${name || character.full_name}".`,
        payload: { electionId, candidateId },
      });
      const candidates = await this.repository.listCandidates(electionId, client);
      const mine = candidates.find((c) => c.id === candidateId);
      if (!mine) throw new Error('Candidate disappeared after declaration');
      return this.toCandidateDto(mine, character.id);
    });
  }

  async donate(userId: string, candidateId: string, amountMinor: number): Promise<CandidateDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      if (amountMinor < 1_000_000) {
        throw AppError.badRequest('Quyên góp tối thiểu 1.000.000 ₫.');
      }
      const election =
        (await this.repository.getCurrentElection(client)) ??
        (await this.repository.latestElection(client));
      if (!election) throw AppError.notFound('Election');
      const before = await this.repository.listCandidates(election.id, client);
      const target = before.find((c) => c.id === candidateId);
      if (!target) throw AppError.notFound('Candidate');
      const balance = await ledger.getBalance(client as any, 'character', character.id);
      if (balance < amountMinor) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền quyên góp.');
      }
      await creditStateFund(
        client as any,
        { ownerType: 'character', ownerId: character.id, kind: 'cash' },
        amountMinor,
        {
          amountMinor,
          reasonCode: 'campaign_donation',
          description: 'Quyên góp tranh cử vào quỹ đất nước',
          refType: 'candidate',
          refId: candidateId,
          actorType: 'character',
          actorId: character.id,
          ledgerKind: 'campaign_donation',
          ledgerDescription: 'Quyên góp tranh cử',
        },
      );
      await this.repository.addDonation(client as any, candidateId, amountMinor);
      const after = await this.repository.listCandidates(election.id, client);
      const updated = after.find((c) => c.id === candidateId);
      if (!updated) throw AppError.notFound('Candidate');
      return this.toCandidateDto(updated, character.id);
    });
  }

  async vote(
    userId: string,
    electionId: string,
    candidateId: string,
  ): Promise<PoliticsOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const election = await this.repository.getElection(electionId, client);
      if (!election) throw AppError.notFound('Election');
      if (election.status !== 'open') {
        throw AppError.badRequest('Cuộc bầu cử đã kết thúc.');
      }
      if (new Date() > election.endsAt) {
        throw AppError.badRequest('Cuộc bầu cử đã quá hạn, đang chờ chốt kết quả.');
      }
      if (await this.repository.hasVoted(electionId, character.id, client)) {
        throw AppError.conflict('already_voted', 'Bạn đã bỏ phiếu trong cuộc bầu cử này.');
      }
      const candidates = await this.repository.listCandidates(electionId, client);
      if (!candidates.some((c) => c.id === candidateId)) {
        throw AppError.notFound('Candidate');
      }
      await this.repository.insertVote(client as any, electionId, character.id, candidateId);
      await enqueueDomainEvent(client as any, {
        type: 'election.vote.v1',
        aggregateType: 'election',
        aggregateId: electionId,
        payload: { electionId, candidateId, voterId: character.id },
      });
      return this.getOverview(userId, client);
    });
  }

  /** Kết thúc bầu cử và (nếu có người thắng) kích hoạt nhiệm kỳ Thị trưởng (Pha A/C). */
  async endElection(userId: string, electionId: string, role?: string): Promise<ElectionDto> {
    return withTransaction(async (client) => {
      await requireLivingCharacterByUserId(client, userId);
      if (role !== 'admin' && role !== 'moderator') {
        throw AppError.forbidden('Chỉ admin mới được chốt kết quả bầu cử.');
      }
      return this.finalizeElection(client, electionId, { actorUserId: userId, source: 'user-endpoint' });
    });
  }

  /** Dùng chung cho user/admin/auto: chốt kết quả, gán nhiệm kỳ, thông báo. Phải gọi trong transaction. */
  async finalizeElection(
    client: Db,
    electionId: string,
    opts: { actorUserId?: string | null; source?: string } = {},
  ): Promise<ElectionDto> {
    const election = await this.repository.getElection(electionId, client);
    if (!election) throw AppError.notFound('Election');
    if (election.status !== 'open') {
      throw AppError.badRequest('Cuộc bầu cử đã kết thúc.');
    }
    const candidates = await this.repository.listCandidates(electionId, client);
    const winnerId = electionWinner(
      candidates.map((c) => ({
        id: c.id,
        votes: c.votes,
        donationsMinor: Number(c.donationsMinor),
      })),
    );
    const winner = winnerId ? candidates.find((c) => c.id === winnerId) : null;
    const config = await getMayorConfig(client as any);
    let term: { winnerCharacterId: string; termDays: number; startedAt: Date; endsAt: Date } | null = null;
    if (winner) {
      // Hết hiệu lực thị trưởng đương nhiệm (nếu có) trước khi nhậm chức mới
      const active = await this.repository.getActiveMayorForUpdate(client as any);
      if (active) {
        await this.repository.expireMayor(client as any, active.electionId);
        await this.repository.insertMayorAction(client as any, {
          electionId: active.electionId,
          actorCharacterId: active.characterId,
          actorUserId: active.userId,
          actionType: 'term_replaced',
          reason: 'Nhiệm kỳ được thay thế bởi kết quả bầu cử mới',
          payload: { newElectionId: electionId },
        });
      }
      const termDays = clampInt(Number(election.termDays ?? config.termDays ?? 7), 1, 365);
      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + termDays * 24 * 3600_000);
      term = { winnerCharacterId: winner.characterId, termDays, startedAt, endsAt };
    }
    await this.repository.endElection(client as any, electionId, winnerId, term);
    await this.repository.insertMayorAction(client as any, {
      electionId,
      actorCharacterId: winner?.characterId ?? null,
      actionType: 'election_finalized',
      reason: opts.source ?? 'finalize',
      payload: { winnerCandidateId: winnerId, winnerCharacterId: winner?.characterId ?? null },
    });
    await enqueueDomainEvent(client as any, {
      type: 'election.ended.v1',
      aggregateType: 'election',
      aggregateId: electionId,
      payload: { electionId, winnerCandidateId: winnerId, winnerCharacterId: winner?.characterId ?? null },
    });

    if (winner) {
      const winChar = await client.query<{ user_id: string | null; full_name: string }>(
        `SELECT user_id, full_name FROM characters WHERE id = $1`,
        [winner.characterId],
      );
      const u = winChar.rows[0];
      if (u?.user_id) {
        await notify(client as any, {
          userId: u.user_id,
          kind: 'politics',
          title: 'Bạn đã đắc cử Thị trưởng',
          body: `Chúc mừng ${u.full_name}! Bạn đã trở thành Thị trưởng (nhiệm kỳ ${term!.termDays} ngày). Hãy sử dụng quyền hạn đúng quy định.`,
          payload: { electionId, characterId: winner.characterId, termEndsAt: term!.endsAt.toISOString() },
        });
        try {
          await publishToUser(u.user_id, 'notification', {
            kind: 'politics',
            title: 'Bạn đã đắc cử Thị trưởng',
            body: 'Bạn đã nhậm chức Thị trưởng. Kiểm tra trang Chính trị để xem quyền lợi và nhiệm vụ.',
            at: Date.now(),
          });
        } catch { /* ignore */ }
      }
      try {
        await publishToAllUsers('notification', {
          kind: 'politics',
          title: 'Thị trưởng mới được bầu',
          body: `${u?.full_name ?? winner.name} đã đắc cử Thị trưởng.`,
          at: Date.now(),
        });
      } catch { /* ignore */ }
    }

    const updated = (await this.repository.getElection(electionId, client))!;
    const candidatesAfter = await this.repository.listCandidates(electionId, client);
    return this.toElectionDto(updated, {
      voted: false,
      youCandidateId: null,
      candidates: candidatesAfter,
      viewerId: null,
    });
  }

  // --- Pha B: Mayor policy actions (whitelist) ---
  async requireActiveMayor(client: Db, userId: string): Promise<{ electionId: string; characterId: string; characterName: string; userId: string; config: MayorConfigDto }> {
    const character = await requireLivingCharacterByUserId(client, userId);
    const active = await this.repository.getActiveMayorForUpdate(client as any);
    if (!active || active.characterId !== character.id) {
      throw AppError.forbidden('Chỉ Thị trưởng đương nhiệm (còn hiệu lực) mới được thực hiện thao tác này.');
    }
    if (active.termEndsAt && active.termEndsAt.getTime() <= Date.now()) {
      await this.repository.expireMayor(client as any, active.electionId);
      throw AppError.forbidden('Nhiệm kỳ Thị trưởng đã hết hạn.');
    }
    const config = await getMayorConfig(client as any);
    if (!config.enabled) throw AppError.forbidden('Hệ thống Thị trưởng hiện đang tạm tắt.');
    return { electionId: active.electionId, characterId: character.id, characterName: character.full_name, userId, config };
  }

  async performPolicyAction(userId: string, req: MayorPolicyActionRequest): Promise<{ ok: true; action: string; detail: Record<string, unknown> }> {
    return withTransaction(async (client) => {
      const mayor = await this.requireActiveMayor(client, userId);
      // Mọi hành động của Thị trưởng không bị giới hạn thời gian/cooldown — có thể gửi yêu cầu liên tục.
      if (mayor.config.policyCostMinor > 0) {
        const govBal = await ledger.getBalance(client as any, 'government', SYSTEM_GOVERNMENT_ID);
        if (govBal < mayor.config.policyCostMinor) {
          throw AppError.conflict('insufficient_treasury', 'Ngân sách nhà nước không đủ để thực hiện hành động này.');
        }
      }

      if (req.type === 'adjust_ot_rate') {
        const min = mayor.config.otRateAdjustMinPct;
        const max = Math.max(min, mayor.config.otRateAdjustMaxPct);
        const raw = Number(req.otRatePercent);
        if (!Number.isFinite(raw)) throw AppError.badRequest('otRatePercent không hợp lệ.');
        const value = clampInt(raw, min, max);
        const macroR = await client.query(`SELECT macro FROM game_state WHERE id = 1 FOR UPDATE`);
        const prevMacro = (macroR.rows[0]?.macro && typeof macroR.rows[0].macro === 'object') ? (macroR.rows[0].macro as any) : {};
        const nextMacro = { ...prevMacro, otRatePercent: value };
        await client.query(
          `INSERT INTO game_state (id, current_day, current_year, season, macro)
           VALUES (1, 0, 2000, 'spring', $1::jsonb)
           ON CONFLICT (id) DO UPDATE SET macro = $1::jsonb, updated_at = now()`,
          [JSON.stringify(nextMacro)],
        );
        await this.repository.insertMayorAction(client as any, {
          electionId: mayor.electionId, actorCharacterId: mayor.characterId, actorUserId: mayor.userId,
          actionType: 'policy_adjust_ot_rate', amountMinor: mayor.config.policyCostMinor || null,
          reason: req.reason ?? null, payload: { from: prevMacro.otRatePercent ?? null, to: value },
        });
        await writeActionLog(pool as any, mayor.userId, 'mayor.policy.adjust_ot_rate', { to: value, reason: req.reason ?? null });
        try { await publishToAllUsers('notification', { kind: 'politics', title: 'Thị trưởng điều chỉnh OT', body: `Mức OT được điều chỉnh thành ${value}%.`, at: Date.now() }); } catch {}
        return { ok: true, action: 'adjust_ot_rate', detail: { otRatePercent: value } };
      }

      if (req.type === 'treasury_welfare_bonus') {
        const perCitizen = clampInt(Number(req.amountPerCitizen ?? mayor.config.welfareBonusPerCitizenMinor), 1_000, mayor.config.treasurySpendLimitMinor);
        const maxCitizens = clampInt(Number(req.maxCitizens ?? mayor.config.welfareBonusMaxCitizens), 1, mayor.config.welfareBonusMaxCitizens || 200);
        const citizens = await client.query<{ id: string }>(
          `SELECT c.id FROM characters c
           JOIN users u ON u.id = c.user_id
           WHERE COALESCE(c.is_alive,true)=true
             AND (u.status IS DISTINCT FROM 'banned')
             AND u.role = 'player'
           ORDER BY c.created_at DESC
           LIMIT $1`,
          [maxCitizens],
        );
        if (citizens.rows.length === 0) throw AppError.badRequest('Không có công dân phù hợp để nhận hỗ trợ.');
        const total = perCitizen * citizens.rows.length;
        if (total > mayor.config.treasurySpendLimitMinor) {
          throw AppError.badRequest(`Tổng chi vượt hạn mức cho phép (${mayor.config.treasurySpendLimitMinor.toLocaleString('vi-VN')} ₫).`);
        }
        const fundBal = await getStateFundBalance(client as any);
        if (fundBal < total) throw AppError.conflict('insufficient_treasury', 'Quỹ đất nước không đủ để chi trả gói hỗ trợ.');
        for (const c of citizens.rows) {
          try {
            await debitStateFund(
              client as any,
              { ownerType: 'character', ownerId: c.id, kind: 'cash' },
              perCitizen,
              {
                amountMinor: -perCitizen,
                reasonCode: 'mayor_welfare_bonus',
                description: 'Gói hỗ trợ phúc lợi do Thị trưởng ban hành (từ quỹ đất nước)',
                refType: 'election',
                refId: mayor.electionId,
                actorType: 'mayor',
                actorId: mayor.characterId,
                ledgerKind: 'mayor_welfare_bonus',
                ledgerDescription: 'Gói hỗ trợ phúc lợi do Thị trưởng ban hành',
              },
            );
          } catch (e: any) {
            if (String(e?.message).includes('STATE_FUND_INSUFFICIENT')) {
              throw AppError.conflict('insufficient_treasury', 'Quỹ đất nước không đủ để chi trả gói hỗ trợ.');
            }
            throw e;
          }
        }
        await this.repository.insertMayorAction(client as any, {
          electionId: mayor.electionId, actorCharacterId: mayor.characterId, actorUserId: mayor.userId,
          actionType: 'policy_treasury_welfare_bonus', amountMinor: total,
          reason: req.reason ?? null, payload: { perCitizen, recipients: citizens.rows.length },
        });
        await writeActionLog(pool as any, mayor.userId, 'mayor.policy.welfare_bonus', { perCitizen, recipients: citizens.rows.length, total, reason: req.reason ?? null });
        try { await publishToAllUsers('notification', { kind: 'politics', title: 'Thị trưởng ban hành gói hỗ trợ', body: `Đã chi ${total.toLocaleString('vi-VN')} ₫ hỗ trợ ${citizens.rows.length} công dân (${perCitizen.toLocaleString('vi-VN')} ₫/người).`, at: Date.now() }); } catch {}
        return { ok: true, action: 'treasury_welfare_bonus', detail: { perCitizen, recipients: citizens.rows.length, total } };
      }

      if (req.type === 'support_companies') {
        const amountPerCompanyMinor = clampInt(Number(req.amountPerCompanyMinor ?? 0), 1_000_000, mayor.config.treasurySpendLimitMinor);
        const tickers = Array.from(new Set((Array.isArray(req.tickers) ? req.tickers : []).map((t) => String(t ?? '').trim().toUpperCase()).filter(Boolean)));
        const companyIds = Array.isArray(req.companyIds) ? req.companyIds.filter(Boolean) : [];
        const supportAll = req.supportAllCompanies === true || (tickers.length === 0 && companyIds.length === 0);
        if (!supportAll && tickers.length === 0 && companyIds.length === 0) {
          throw AppError.badRequest('Vui lòng nhập Mã chứng khoán của công ty cần hỗ trợ hoặc chọn hỗ trợ toàn bộ.');
        }
        // Xác định công ty mục tiêu (ưu tiên mã chứng khoán) để kiểm tra hạn mức trước khi chi.
        let targets;
        try {
          targets = await resolveSupportTargets(client as any, {
            scope: supportAll ? 'all' : 'selected',
            tickers: supportAll ? undefined : tickers,
            companyIds: supportAll ? undefined : companyIds,
          });
        } catch (e: any) {
          const msg = String(e?.message ?? '');
          if (msg.includes('TICKERS_NOT_FOUND')) throw AppError.badRequest('Không tìm thấy công ty đang niêm yết với Mã chứng khoán đã nhập.');
          if (msg.includes('NO_COMPANIES')) throw AppError.badRequest('Vui lòng nhập Mã chứng khoán của công ty cần hỗ trợ hoặc chọn hỗ trợ toàn bộ.');
          throw e;
        }
        const targetCount = targets.length;
        if (targetCount <= 0) throw AppError.badRequest('Không tìm thấy công ty hợp lệ để hỗ trợ (đang hoạt động/IPO).');
        const total = amountPerCompanyMinor * targetCount;
        if (total > mayor.config.treasurySpendLimitMinor) {
          throw AppError.badRequest(`Tổng chi vượt hạn mức cho phép (${mayor.config.treasurySpendLimitMinor.toLocaleString('vi-VN')} ₫).`);
        }
        const fundBal = await getStateFundBalance(client as any);
        if (fundBal < total) throw AppError.conflict('insufficient_treasury', 'Quỹ đất nước không đủ để hỗ trợ doanh nghiệp.');
        let result;
        try {
          result = await supportCompaniesFromStateFund(client as any, {
            scope: supportAll ? 'all' : 'selected',
            tickers: supportAll ? undefined : tickers,
            companyIds: supportAll ? undefined : companyIds,
            amountPerCompanyMinor,
            reason: req.reason ?? 'Hỗ trợ doanh nghiệp và ổn định/thúc đẩy biến động thị trường',
            actorType: 'mayor',
            actorId: mayor.characterId,
            refType: 'election',
            refId: mayor.electionId,
          });
        } catch (e: any) {
          const msg = String(e?.message ?? '');
          if (msg.includes('STATE_FUND_INSUFFICIENT')) throw AppError.conflict('insufficient_treasury', 'Quỹ đất nước không đủ để hỗ trợ doanh nghiệp.');
          if (msg.includes('NO_ELIGIBLE_COMPANIES') || msg.includes('NO_COMPANIES')) throw AppError.badRequest('Không tìm thấy công ty hợp lệ để hỗ trợ (đang hoạt động/IPO).');
          if (msg.includes('TICKERS_NOT_FOUND')) throw AppError.badRequest('Không tìm thấy công ty đang niêm yết với Mã chứng khoán đã nhập.');
          throw e;
        }
        await this.repository.insertMayorAction(client as any, {
          electionId: mayor.electionId, actorCharacterId: mayor.characterId, actorUserId: mayor.userId,
          actionType: 'policy_support_companies', amountMinor: result.totalSpentMinor,
          reason: req.reason ?? null,
          payload: { scope: supportAll ? 'all' : 'selected', tickers: supportAll ? null : tickers, companyIds: supportAll ? null : companyIds, amountPerCompanyMinor, supportedCompanies: result.supportedCompanies, boostedTickers: result.boostedTickers, supportedTickers: result.tickers },
        });
        await writeActionLog(pool as any, mayor.userId, 'mayor.policy.support_companies', { scope: supportAll ? 'all' : 'selected', tickers: supportAll ? null : tickers, amountPerCompanyMinor, supportedCompanies: result.supportedCompanies, totalSpentMinor: result.totalSpentMinor, boostedTickers: result.boostedTickers, reason: req.reason ?? null });
        try { await publishToAllUsers('notification', { kind: 'politics', title: 'Thị trưởng hỗ trợ doanh nghiệp từ quỹ đất nước', body: `Đã hỗ trợ ${result.supportedCompanies} công ty${result.tickers.length ? ` (${result.tickers.join(', ')})` : ''} với ${amountPerCompanyMinor.toLocaleString('vi-VN')} ₫/công ty, tổng ${result.totalSpentMinor.toLocaleString('vi-VN')} ₫. Biến động/thanh khoản sàn có thể tăng.`, at: Date.now() }); } catch {}
        return { ok: true, action: 'support_companies', detail: { supportedCompanies: result.supportedCompanies, tickers: result.tickers, amountPerCompanyMinor, totalSpentMinor: result.totalSpentMinor, boostedTickers: result.boostedTickers, scope: supportAll ? 'all' : 'selected' } };
      }

      throw AppError.badRequest('Loại hành động chính sách không được hỗ trợ.');
    });
  }

  /** Pha C: Admin thu hồi/hủy tư cách Thị trưởng khi lạm dụng. */
  async adminRevokeMayor(actorUserId: string, reason: string, electionId?: string): Promise<MayorStateDto> {
    return withTransaction(async (client) => {
      let targetElectionId = electionId ?? null;
      if (!targetElectionId) {
        const active = await this.repository.getActiveMayorForUpdate(client as any);
        if (!active) throw AppError.notFound('Không có Thị trưởng đương nhiệm để thu hồi tư cách.');
        targetElectionId = active.electionId;
      }
      const election = await this.repository.getElection(targetElectionId, client);
      if (!election) throw AppError.notFound('Election');
      if (election.termStatus === 'revoked') {
        throw AppError.badRequest('Tư cách Thị trưởng của nhiệm kỳ này đã bị thu hồi trước đó.');
      }
      if (election.termStatus !== 'active') {
        throw AppError.badRequest('Chỉ có thể thu hồi tư cách của Thị trưởng đang tại nhiệm.');
      }
      await this.repository.revokeMayor(client as any, targetElectionId, actorUserId, reason);
      await this.repository.insertMayorAction(client as any, {
        electionId: targetElectionId,
        actorUserId,
        actionType: 'mayor_revoked',
        reason,
        payload: { by: actorUserId },
      });
      await writeActionLog(pool as any, actorUserId, 'politics.mayor.revoke', { electionId: targetElectionId, reason });

      if (election.winnerCharacterId) {
        const u = await client.query<{ user_id: string | null; full_name: string }>(
          `SELECT user_id, full_name FROM characters WHERE id = $1`, [election.winnerCharacterId]
        );
        const row = u.rows[0];
        if (row?.user_id) {
          await notify(client as any, {
            userId: row.user_id,
            kind: 'politics',
            title: 'Tư cách Thị trưởng đã bị thu hồi',
            body: `Tư cách Thị trưởng của bạn đã bị quản trị viên thu hồi. Lý do: ${reason}`,
            payload: { electionId: targetElectionId, reason },
          });
          try { await publishToUser(row.user_id, 'notification', { kind: 'politics', title: 'Bị thu hồi tư cách Thị trưởng', body: 'Quyền hạn và lợi ích Thị trưởng đã bị thu hồi.', at: Date.now() }); } catch {}
        }
        try { await publishToAllUsers('notification', { kind: 'politics', title: 'Thu hồi tư cách Thị trưởng', body: `Tư cách Thị trưởng của ${row?.full_name ?? 'nhân vật'} đã bị thu hồi do vi phạm/lạm dụng.`, at: Date.now() }); } catch {}
      }

      // return latest state for actor context not needed; caller can refetch overview
      const dummyUser = actorUserId;
      // build minimal mayor state (inactive) best-effort
      const config = await getMayorConfig(client as any);
      return {
        active: false, electionId: null, characterId: null, characterName: null, userId: null,
        termStatus: 'none', termStartedAt: null, termEndsAt: null, revokedAt: null, revokedReason: null,
        isYou: false, config,
      };
    });
  }

  /** Hết hạn nhiệm kỳ (Pha C) - có thể gọi định kỳ/best-effort. */
  async expireOverdueTerms(): Promise<number> {
    return withTransaction(async (client) => {
      const r = await client.query<{ id: string; winner_character_id: string | null }>(
        `SELECT id, winner_character_id FROM elections
         WHERE term_status = 'active' AND term_ends_at IS NOT NULL AND term_ends_at <= now()
         FOR UPDATE`,
      );
      let n = 0;
      for (const row of r.rows) {
        await this.repository.expireMayor(client as any, row.id);
        await this.repository.insertMayorAction(client as any, {
          electionId: row.id,
          actorCharacterId: row.winner_character_id,
          actionType: 'term_expired',
          reason: 'Hết hạn nhiệm kỳ',
          payload: {},
        });
        n++;
      }
      if (n > 0) {
        try { await publishToAllUsers('notification', { kind: 'politics', title: 'Nhiệm kỳ Thị trưởng kết thúc', body: 'Nhiệm kỳ Thị trưởng đã hết hạn. Hệ thống có thể mở bầu cử mới.', at: Date.now() }); } catch {}
      }
      return n;
    });
  }

  private toElectionDto(
    row: any,
    ctx: { voted: boolean; youCandidateId: string | null; candidates: any[]; viewerId: string | null },
  ): ElectionDto {
    return {
      id: row.id,
      office: (row.office ?? 'mayor') as 'mayor',
      status: row.status as 'open' | 'ended',
      startsAt: row.startsAt instanceof Date ? row.startsAt.toISOString() : new Date(row.startsAt).toISOString(),
      endsAt: row.endsAt instanceof Date ? row.endsAt.toISOString() : new Date(row.endsAt).toISOString(),
      winnerCandidateId: row.winnerCandidateId ?? null,
      youVoted: ctx.voted,
      youCandidateId: ctx.youCandidateId,
      winnerCharacterId: row.winnerCharacterId ?? null,
      winnerCharacterName: row.winnerCharacterName ?? null,
      termDays: row.termDays ?? null,
      termStartedAt: row.termStartedAt ? new Date(row.termStartedAt).toISOString() : null,
      termEndsAt: row.termEndsAt ? new Date(row.termEndsAt).toISOString() : null,
      termStatus: (row.termStatus ?? 'none') as any,
      revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
      revokedReason: row.revokedReason ?? null,
    };
  }

  private toCandidateDto(
    row: Awaited<ReturnType<typeof politicsRepository.listCandidates>>[number],
    viewerId: string,
  ): CandidateDto {
    return {
      id: row.id,
      characterId: row.characterId,
      name: row.name,
      votes: row.votes,
      donations: money(Number(row.donationsMinor)),
      score: candidateScore({ votes: row.votes, donationsMinor: Number(row.donationsMinor) }),
      isMe: row.characterId === viewerId,
    };
  }
}

export const politicsService = new PoliticsService();

