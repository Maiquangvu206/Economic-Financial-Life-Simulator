import { candidateScore, electionWinner } from '@efls/domain';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction, type Db } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_GOVERNMENT_ID } from '../../shared/ledger/ledger.service.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';
import { notify } from '../notifications/notification.service.js';
import {
  type PoliticsOverviewDto,
  type CandidateDto,
  type ElectionDto,
  MoneySchema,
} from '@efls/contracts';
import { politicsRepository } from './politics.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

const CAMPAIGN_FEE = 5_000_000;

/** Dịch vụ chính trị & bầu cử Thị trưởng: ứng cử, quyên góp, bỏ phiếu, chốt kết quả. */
export class PoliticsService {
  constructor(private readonly repository = politicsRepository) {}

  async getOverview(userId: string, dbOverride?: Db): Promise<PoliticsOverviewDto> {
    const db = dbOverride ?? this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const electionRow =
      (await this.repository.getCurrentElection(db)) ?? (await this.repository.latestElection(db));
    if (!electionRow) {
      return { election: null, candidates: [] };
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
    };
    return {
      election,
      candidates: candidates.map((c) => this.toCandidateDto(c, character.id)),
    };
  }

  /** Tạo cuộc bầu cử mới (khi chưa có cuộc mở, hoặc đã kết thúc). */
  async createElection(userId: string, endsAt?: Date): Promise<ElectionDto> {
    return withTransaction(async (client) => {
      await requireCharacterByUserId(client, userId);
      const open = await this.repository.getCurrentElection(client);
      if (open) {
        throw AppError.conflict('election_open', 'Đã có cuộc bầu cử đang mở.');
      }
      const election = await this.repository.createElection(
        client,
        endsAt ?? new Date(Date.now() + 7 * 24 * 3600_000),
      );
      await enqueueDomainEvent(client, {
        type: 'election.started.v1',
        aggregateType: 'election',
        aggregateId: election.id,
        payload: { electionId: election.id, office: 'mayor' },
      });
      await notify(client, {
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

  /** Ứng cử: phí tranh cử 5tr, mỗi người mỗi cuộc 1 lần. */
  async declareCandidacy(userId: string, electionId: string, name: string): Promise<CandidateDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const election = await this.repository.getElection(electionId, client);
      if (!election) throw AppError.notFound('Election');
      if (election.status !== 'open') {
        throw AppError.badRequest('Cuộc bầu cử đã kết thúc.');
      }
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < CAMPAIGN_FEE) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền phí tranh cử (5.000.000 ₫).');
      }
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID },
        amountMinor: CAMPAIGN_FEE,
        kind: 'campaign_fee',
        description: 'Phí tranh cử Thị trưởng',
        referenceType: 'election',
        referenceId: electionId,
      });
      const candidateId = await this.repository.declareCandidacy(
        client,
        electionId,
        character.id,
        name || character.full_name,
      );
      await enqueueDomainEvent(client, {
        type: 'election.candidacy.v1',
        aggregateType: 'election',
        aggregateId: electionId,
        payload: { electionId, candidateId, characterId: character.id },
      });
      await notify(client, {
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

  /** Quyên góp cho ứng viên: 1tr = +10 điểm (theo rule domain). */
  async donate(userId: string, candidateId: string, amountMinor: number): Promise<CandidateDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
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
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < amountMinor) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền quyên góp.');
      }
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID },
        amountMinor,
        kind: 'campaign_donation',
        description: 'Quyên góp tranh cử',
        referenceType: 'candidate',
        referenceId: candidateId,
      });
      await this.repository.addDonation(client, candidateId, amountMinor);
      const after = await this.repository.listCandidates(election.id, client);
      const updated = after.find((c) => c.id === candidateId);
      if (!updated) throw AppError.notFound('Candidate');
      return this.toCandidateDto(updated, character.id);
    });
  }

  /** Bỏ phiếu: mỗi người mỗi cuộc 1 phiếu. */
  async vote(
    userId: string,
    electionId: string,
    candidateId: string,
  ): Promise<PoliticsOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
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
      await this.repository.insertVote(client, electionId, character.id, candidateId);
      await enqueueDomainEvent(client, {
        type: 'election.vote.v1',
        aggregateType: 'election',
        aggregateId: electionId,
        payload: { electionId, candidateId, voterId: character.id },
      });
      return this.getOverview(userId, client);
    });
  }

  /** Chốt kết quả: chỉ admin/moderator mới được chốt (không phải người chơi). */
  async endElection(userId: string, electionId: string, role?: string): Promise<ElectionDto> {
    return withTransaction(async (client) => {
      await requireCharacterByUserId(client, userId);
      if (role !== 'admin' && role !== 'moderator') {
        throw AppError.forbidden('Chỉ admin mới được chốt kết quả bầu cử.');
      }
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
      await this.repository.endElection(client, electionId, winnerId);
      await enqueueDomainEvent(client, {
        type: 'election.ended.v1',
        aggregateType: 'election',
        aggregateId: electionId,
        payload: { electionId, winnerCandidateId: winnerId },
      });
      const overview = await this.getOverview(userId, client);
      return overview.election!;
    });
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
