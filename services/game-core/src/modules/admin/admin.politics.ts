import type { Request, Response } from 'express';
import { candidateScore } from '@efls/domain';
import { MoneySchema, type CandidateDto, type MayorConfigDto } from '@efls/contracts';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';
import { writeActionLog } from '../../shared/audit/actionLog.js';
import { politicsRepository } from '../politics/politics.repository.js';
import { politicsService, normalizeMayorConfig } from '../politics/politics.service.js';

function ensureAdmin(req: Request): void {
  if (req.actorRole !== 'admin' && req.actorRole !== 'moderator') {
    throw AppError.forbidden('Admin role required');
  }
}

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function toCandidateDto(
  row: Awaited<ReturnType<typeof politicsRepository.listCandidates>>[number],
): CandidateDto {
  return {
    id: row.id,
    characterId: row.characterId,
    name: row.name,
    votes: row.votes,
    donations: money(Number(row.donationsMinor)),
    score: candidateScore({ votes: row.votes, donationsMinor: Number(row.donationsMinor) }),
    isMe: false,
  };
}

async function getMayorConfig(): Promise<MayorConfigDto> {
  const r = await pool.query(`SELECT macro FROM game_state WHERE id = 1`);
  const macro = (r.rows[0]?.macro && typeof r.rows[0].macro === 'object') ? r.rows[0].macro : {};
  return normalizeMayorConfig((macro as any).mayor);
}

async function buildElectionView(election: any) {
  const [candidates, totalVotes] = await Promise.all([
    politicsRepository.listCandidates(election.id),
    politicsRepository.countVotes(election.id),
  ]);
  return {
    id: election.id,
    office: election.office as 'mayor',
    status: election.status as 'open' | 'ended',
    startsAt: election.startsAt.toISOString(),
    endsAt: election.endsAt.toISOString(),
    winnerCandidateId: election.winnerCandidateId,
    winnerCharacterId: election.winnerCharacterId ?? null,
    winnerCharacterName: election.winnerCharacterName ?? null,
    termDays: election.termDays ?? null,
    termStartedAt: election.termStartedAt ? election.termStartedAt.toISOString() : null,
    termEndsAt: election.termEndsAt ? election.termEndsAt.toISOString() : null,
    termStatus: election.termStatus ?? 'none',
    revokedAt: election.revokedAt ? election.revokedAt.toISOString() : null,
    revokedReason: election.revokedReason ?? null,
    youVoted: false,
    youCandidateId: null,
    totalVotes,
    candidates: candidates.map(toCandidateDto),
  };
}

export async function getPoliticsAdminOverview(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const [elections, activeMayor, mayorConfig, actions] = await Promise.all([
    politicsRepository.listElections(pool, 20),
    politicsRepository.getActiveMayor(pool),
    getMayorConfig(),
    politicsRepository.listMayorActions(pool, 30),
  ]);
  const detailed = await Promise.all(elections.map((e) => buildElectionView(e)));
  const current = detailed.find((e) => e.status === 'open') ?? detailed[0] ?? null;
  res.json({
    current,
    elections: detailed,
    mayor: activeMayor ? {
      active: true,
      electionId: activeMayor.electionId,
      characterId: activeMayor.characterId,
      characterName: activeMayor.characterName,
      userId: activeMayor.userId,
      termStatus: activeMayor.termStatus,
      termStartedAt: activeMayor.termStartedAt ? activeMayor.termStartedAt.toISOString() : null,
      termEndsAt: activeMayor.termEndsAt ? activeMayor.termEndsAt.toISOString() : null,
      revokedAt: activeMayor.revokedAt ? activeMayor.revokedAt.toISOString() : null,
      revokedReason: activeMayor.revokedReason ?? null,
      config: mayorConfig,
    } : { active: false, config: mayorConfig },
    actions: actions.map((a) => ({
      id: a.id,
      electionId: a.electionId,
      actionType: a.actionType,
      status: a.status,
      amountMinor: a.amountMinor != null ? Number(a.amountMinor) : null,
      reason: a.reason,
      payload: a.payload ?? {},
      actorCharacterName: a.actorCharacterName,
      createdAt: a.createdAt.toISOString(),
    })),
    config: {
      office: 'mayor',
      campaignFeeMinor: 5_000_000,
      minDonationMinor: 1_000_000,
      donationScoreRule: '1.000.000 ₫ = +10 điểm',
      voteScoreRule: '1 phiếu = +1 điểm',
      winnerRule: 'Điểm cao nhất (phiếu + quyên góp); hòa thì không có người thắng. Người thắng nhận nhiệm kỳ Thị trưởng (nếu hệ thống bật).',
      defaultDurationDays: 7,
      mayor: mayorConfig,
    },
  });
}

export async function createPoliticsElection(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = (req.body ?? {}) as { office?: 'mayor'; endsAt?: string; durationDays?: number; termDays?: number };
  const endsAt = body.endsAt
    ? new Date(body.endsAt)
    : new Date(Date.now() + (Number(body.durationDays) > 0 ? Number(body.durationDays) : 7) * 24 * 3600_000);
  if (Number.isNaN(endsAt.getTime())) {
    throw AppError.badRequest('Thời gian kết thúc (endsAt) không hợp lệ.');
  }
  const mayorConfig = await getMayorConfig();
  const termDays = Number(body.termDays) > 0 ? Math.round(Number(body.termDays)) : mayorConfig.termDays;

  const election = await withTransaction(async (client) => {
    const open = await politicsRepository.getCurrentElection(client);
    if (open) {
      throw AppError.conflict('election_open', 'Đã có cuộc bầu cử đang mở. Hãy chốt cuộc hiện tại trước.');
    }
    const created = await politicsRepository.createElection(client, endsAt, termDays);
    await enqueueDomainEvent(client, {
      type: 'election.started.v1',
      aggregateType: 'election',
      aggregateId: created.id,
      payload: { electionId: created.id, office: 'mayor', source: 'admin', termDays },
    });
    await writeActionLog(pool as any, req.actorId ?? null, 'politics.election.create', { electionId: created.id, endsAt: endsAt.toISOString(), termDays });
    return created;
  });
  res.status(201).json(await buildElectionView(election));
}

export async function endPoliticsElection(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const electionId = req.params.id as string;
  const election = await withTransaction(async (client) => {
    await politicsService.finalizeElection(client, electionId, { actorUserId: req.actorId ?? null, source: 'admin' });
    return (await politicsRepository.getElection(electionId, client))!;
  });
  await writeActionLog(pool as any, req.actorId ?? null, 'politics.election.end', { electionId, winnerCandidateId: election.winnerCandidateId, winnerCharacterId: election.winnerCharacterId });
  res.json(await buildElectionView(election));
}

export async function revokeMayor(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = (req.body ?? {}) as { electionId?: string; reason?: string };
  const reason = String(body.reason ?? '').trim();
  if (reason.length < 5) throw AppError.badRequest('Vui lòng nhập lý do thu hồi tư cách (tối thiểu 5 ký tự).');
  await politicsService.adminRevokeMayor(req.actorId!, reason, body.electionId || undefined);
  res.json({ ok: true });
}

export async function updateMayorConfig(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const existing = await pool.query(`SELECT macro FROM game_state WHERE id = 1`);
  const prevMacro = (existing.rows[0]?.macro && typeof existing.rows[0].macro === 'object') ? (existing.rows[0].macro as any) : {};
  const prevMayor = normalizeMayorConfig(prevMacro.mayor);
  const nextMayor = normalizeMayorConfig({ ...prevMayor, ...body });
  const nextMacro = { ...prevMacro, mayor: nextMayor };
  await pool.query(
    `INSERT INTO game_state (id, current_day, current_year, season, macro)
     VALUES (1, 0, 1, 'spring', $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET macro = $1::jsonb, updated_at = now()`,
    [JSON.stringify(nextMacro)],
  );
  await writeActionLog(pool as any, req.actorId ?? null, 'politics.mayor.config.update', { before: prevMayor, after: nextMayor });
  res.json({ ok: true, mayor: nextMayor });
}

export async function expireMayorTerms(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const expired = await politicsService.expireOverdueTerms();
  res.json({ ok: true, expired });
}
