import type { Request, Response } from 'express';
import { candidateScore, electionWinner } from '@efls/domain';
import { MoneySchema, type CandidateDto, type ElectionDto } from '@efls/contracts';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';
import { politicsRepository } from '../politics/politics.repository.js';

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

async function buildElectionView(election: {
  id: string;
  office: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  winnerCandidateId: string | null;
}): Promise<ElectionDto & { totalVotes: number; candidates: CandidateDto[] }> {
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
    youVoted: false,
    youCandidateId: null,
    totalVotes,
    candidates: candidates.map(toCandidateDto),
  };
}

export async function getPoliticsAdminOverview(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const elections = await politicsRepository.listElections(pool, 20);
  const detailed = await Promise.all(elections.map((e) => buildElectionView(e)));
  const current = detailed.find((e) => e.status === 'open') ?? detailed[0] ?? null;
  res.json({
    current,
    elections: detailed,
    config: {
      office: 'mayor',
      campaignFeeMinor: 5_000_000,
      minDonationMinor: 1_000_000,
      donationScoreRule: '1.000.000 ₫ = +10 điểm',
      voteScoreRule: '1 phiếu = +1 điểm',
      winnerRule: 'Điểm cao nhất (phiếu + quyên góp); hòa thì không có người thắng',
      defaultDurationDays: 7,
    },
  });
}

export async function createPoliticsElection(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = (req.body ?? {}) as { office?: 'mayor'; endsAt?: string; durationDays?: number };
  const endsAt = body.endsAt
    ? new Date(body.endsAt)
    : new Date(Date.now() + (Number(body.durationDays) > 0 ? Number(body.durationDays) : 7) * 24 * 3600_000);
  if (Number.isNaN(endsAt.getTime())) {
    throw AppError.badRequest('Thời gian kết thúc (endsAt) không hợp lệ.');
  }
  const election = await withTransaction(async (client) => {
    const open = await politicsRepository.getCurrentElection(client);
    if (open) {
      throw AppError.conflict('election_open', 'Đã có cuộc bầu cử đang mở. Hãy chốt cuộc hiện tại trước.');
    }
    const created = await politicsRepository.createElection(client, endsAt);
    await enqueueDomainEvent(client, {
      type: 'election.started.v1',
      aggregateType: 'election',
      aggregateId: created.id,
      payload: { electionId: created.id, office: 'mayor', source: 'admin' },
    });
    return created;
  });
  res.status(201).json(await buildElectionView(election));
}

export async function endPoliticsElection(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const electionId = req.params.id as string;
  const election = await withTransaction(async (client) => {
    const current = await politicsRepository.getElection(electionId, client);
    if (!current) throw AppError.notFound('Election');
    if (current.status !== 'open') throw AppError.badRequest('Cuộc bầu cử đã kết thúc.');
    const candidates = await politicsRepository.listCandidates(electionId, client);
    const winnerId = electionWinner(
      candidates.map((c) => ({
        id: c.id,
        votes: c.votes,
        donationsMinor: Number(c.donationsMinor),
      })),
    );
    await politicsRepository.endElection(client, electionId, winnerId);
    await enqueueDomainEvent(client, {
      type: 'election.ended.v1',
      aggregateType: 'election',
      aggregateId: electionId,
      payload: { electionId, winnerCandidateId: winnerId, source: 'admin' },
    });
    return (await politicsRepository.getElection(electionId, client))!;
  });
  res.json(await buildElectionView(election));
}
