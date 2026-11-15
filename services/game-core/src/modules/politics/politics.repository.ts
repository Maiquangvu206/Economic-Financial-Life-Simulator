import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface ElectionRow {
  id: string;
  office: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  winnerCandidateId: string | null;
  winnerCharacterId: string | null;
  winnerCharacterName?: string | null;
  termDays: number | null;
  termStartedAt: Date | null;
  termEndsAt: Date | null;
  termStatus: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
}

export interface CandidateRow {
  id: string;
  characterId: string;
  name: string;
  votes: number;
  donationsMinor: string;
  electionId: string;
}

export interface ActiveMayorRow {
  electionId: string;
  characterId: string;
  characterName: string;
  userId: string | null;
  termStatus: string;
  termStartedAt: Date | null;
  termEndsAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
}

/** Truy cập bầu cử & nhiệm kỳ Thị trưởng. */
export class PoliticsRepository {
  constructor(readonly db: Db = pool) {}

  private electionSelect(alias = 'e') {
    return `
      ${alias}.id,
      ${alias}.office,
      ${alias}.status,
      ${alias}.starts_at AS "startsAt",
      ${alias}.ends_at AS "endsAt",
      ${alias}.winner_candidate_id AS "winnerCandidateId",
      ${alias}.winner_character_id AS "winnerCharacterId",
      wc.full_name AS "winnerCharacterName",
      ${alias}.term_days AS "termDays",
      ${alias}.term_started_at AS "termStartedAt",
      ${alias}.term_ends_at AS "termEndsAt",
      COALESCE(${alias}.term_status,'none') AS "termStatus",
      ${alias}.revoked_at AS "revokedAt",
      ${alias}.revoked_reason AS "revokedReason"
    `;
  }

  async getCurrentElection(db: Db = this.db): Promise<ElectionRow | null> {
    const result = await db.query<ElectionRow>(
      `SELECT ${this.electionSelect('e')}
       FROM elections e
       LEFT JOIN characters wc ON wc.id = e.winner_character_id
       WHERE e.status = 'open' ORDER BY e.created_at DESC LIMIT 1`,
    );
    return result.rows[0] ?? null;
  }

  async getElection(electionId: string, db: Db = this.db): Promise<ElectionRow | null> {
    const result = await db.query<ElectionRow>(
      `SELECT ${this.electionSelect('e')}
       FROM elections e
       LEFT JOIN characters wc ON wc.id = e.winner_character_id
       WHERE e.id = $1`,
      [electionId],
    );
    return result.rows[0] ?? null;
  }

  async createElection(client: Db, endsAt: Date, termDays?: number | null): Promise<ElectionRow> {
    const result = await client.query<ElectionRow>(
      `INSERT INTO elections (id, office, status, ends_at, term_days)
       VALUES (gen_random_uuid(), 'mayor', 'open', $1, $2)
       RETURNING id, office, status, starts_at AS "startsAt", ends_at AS "endsAt",
                 winner_candidate_id AS "winnerCandidateId",
                 winner_character_id AS "winnerCharacterId",
                 NULL::text AS "winnerCharacterName",
                 term_days AS "termDays",
                 term_started_at AS "termStartedAt",
                 term_ends_at AS "termEndsAt",
                 COALESCE(term_status,'none') AS "termStatus",
                 revoked_at AS "revokedAt",
                 revoked_reason AS "revokedReason"`,
      [endsAt, termDays ?? null],
    );
    return result.rows[0]!;
  }

  async listCandidates(electionId: string, db: Db = this.db): Promise<CandidateRow[]> {
    const result = await db.query<CandidateRow>(
      `SELECT c.id, c.character_id AS "characterId", c.name, c.votes,
              c.donations_minor AS "donationsMinor", c.election_id AS "electionId"
       FROM candidates c WHERE c.election_id = $1 ORDER BY c.votes DESC`,
      [electionId],
    );
    return result.rows;
  }

  async declareCandidacy(
    client: Db,
    electionId: string,
    characterId: string,
    name: string,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO candidates (id, election_id, character_id, name)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (election_id, character_id) DO NOTHING
       RETURNING id`,
      [electionId, characterId, name],
    );
    if (result.rows[0]) return result.rows[0].id;
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM candidates WHERE election_id = $1 AND character_id = $2`,
      [electionId, characterId],
    );
    return existing.rows[0]!.id;
  }

  async hasVoted(electionId: string, voterId: string, db: Db = this.db): Promise<boolean> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM votes WHERE election_id = $1 AND voter_id = $2`,
      [electionId, voterId],
    );
    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async insertVote(
    client: Db,
    electionId: string,
    voterId: string,
    candidateId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO votes (id, election_id, voter_id, candidate_id)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [electionId, voterId, candidateId],
    );
    await client.query(`UPDATE candidates SET votes = votes + 1 WHERE id = $1`, [candidateId]);
  }

  async addDonation(client: Db, candidateId: string, amountMinor: number): Promise<void> {
    await client.query(
      `UPDATE candidates SET donations_minor = donations_minor + $2 WHERE id = $1`,
      [candidateId, amountMinor],
    );
  }

  async endElection(
    client: Db,
    electionId: string,
    winnerCandidateId: string | null,
    term?: { winnerCharacterId: string | null; termDays: number; startedAt: Date; endsAt: Date } | null,
  ): Promise<void> {
    if (winnerCandidateId && term?.winnerCharacterId) {
      await client.query(
        `UPDATE elections
         SET status = 'ended',
             winner_candidate_id = $2,
             winner_character_id = $3,
             term_days = $4,
             term_started_at = $5,
             term_ends_at = $6,
             term_status = 'active'
         WHERE id = $1`,
        [electionId, winnerCandidateId, term.winnerCharacterId, term.termDays, term.startedAt, term.endsAt],
      );
    } else {
      await client.query(
        `UPDATE elections
         SET status = 'ended',
             winner_candidate_id = $2,
             term_status = 'none'
         WHERE id = $1`,
        [electionId, winnerCandidateId],
      );
    }
  }

  async latestElection(db: Db = this.db): Promise<ElectionRow | null> {
    const result = await db.query<ElectionRow>(
      `SELECT ${this.electionSelect('e')}
       FROM elections e
       LEFT JOIN characters wc ON wc.id = e.winner_character_id
       ORDER BY e.created_at DESC LIMIT 1`,
    );
    return result.rows[0] ?? null;
  }

  async listElections(db: Db = this.db, limit = 20): Promise<ElectionRow[]> {
    const result = await db.query<ElectionRow>(
      `SELECT ${this.electionSelect('e')}
       FROM elections e
       LEFT JOIN characters wc ON wc.id = e.winner_character_id
       ORDER BY e.created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async countVotes(electionId: string, db: Db = this.db): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM votes WHERE election_id = $1`,
      [electionId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getActiveMayor(db: Db = this.db): Promise<ActiveMayorRow | null> {
    const result = await db.query<ActiveMayorRow>(
      `SELECT e.id AS "electionId",
              e.winner_character_id AS "characterId",
              c.full_name AS "characterName",
              c.user_id AS "userId",
              COALESCE(e.term_status,'none') AS "termStatus",
              e.term_started_at AS "termStartedAt",
              e.term_ends_at AS "termEndsAt",
              e.revoked_at AS "revokedAt",
              e.revoked_reason AS "revokedReason"
       FROM elections e
       JOIN characters c ON c.id = e.winner_character_id
       WHERE e.term_status = 'active'
         AND e.winner_character_id IS NOT NULL
         AND (e.term_ends_at IS NULL OR e.term_ends_at > now())
         AND e.revoked_at IS NULL
       ORDER BY e.term_started_at DESC NULLS LAST, e.created_at DESC
       LIMIT 1`,
    );
    return result.rows[0] ?? null;
  }

  async getActiveMayorForUpdate(client: Db): Promise<ActiveMayorRow | null> {
    const result = await client.query<ActiveMayorRow>(
      `SELECT e.id AS "electionId",
              e.winner_character_id AS "characterId",
              c.full_name AS "characterName",
              c.user_id AS "userId",
              COALESCE(e.term_status,'none') AS "termStatus",
              e.term_started_at AS "termStartedAt",
              e.term_ends_at AS "termEndsAt",
              e.revoked_at AS "revokedAt",
              e.revoked_reason AS "revokedReason"
       FROM elections e
       JOIN characters c ON c.id = e.winner_character_id
       WHERE e.term_status = 'active'
         AND e.winner_character_id IS NOT NULL
         AND e.revoked_at IS NULL
       ORDER BY e.term_started_at DESC NULLS LAST, e.created_at DESC
       LIMIT 1
       FOR UPDATE OF e`,
    );
    return result.rows[0] ?? null;
  }

  async revokeMayor(client: Db, electionId: string, revokedBy: string, reason: string): Promise<void> {
    await client.query(
      `UPDATE elections
       SET term_status = 'revoked',
           revoked_at = now(),
           revoked_by = $2,
           revoked_reason = $3
       WHERE id = $1`,
      [electionId, revokedBy, reason],
    );
  }

  async expireMayor(client: Db, electionId: string): Promise<void> {
    await client.query(
      `UPDATE elections SET term_status = 'expired' WHERE id = $1 AND term_status = 'active'`,
      [electionId],
    );
  }

  async insertMayorAction(
    client: Db,
    data: {
      electionId?: string | null;
      actorCharacterId?: string | null;
      actorUserId?: string | null;
      actionType: string;
      status?: string;
      amountMinor?: number | null;
      reason?: string | null;
      payload?: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO mayor_actions (id, election_id, actor_character_id, actor_user_id, action_type, status, amount_minor, reason, payload)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        data.electionId ?? null,
        data.actorCharacterId ?? null,
        data.actorUserId ?? null,
        data.actionType,
        data.status ?? 'applied',
        data.amountMinor ?? null,
        data.reason ?? null,
        JSON.stringify(data.payload ?? {}),
      ],
    );
  }

  async listMayorActions(db: Db = this.db, limit = 30): Promise<Array<{
    id: string; electionId: string | null; actionType: string; status: string;
    amountMinor: string | null; reason: string | null; payload: any; createdAt: Date; actorCharacterName: string | null;
  }>> {
    const r = await db.query(
      `SELECT a.id, a.election_id AS "electionId", a.action_type AS "actionType", a.status,
              a.amount_minor AS "amountMinor", a.reason, a.payload, a.created_at AS "createdAt",
              c.full_name AS "actorCharacterName"
       FROM mayor_actions a
       LEFT JOIN characters c ON c.id = a.actor_character_id
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return r.rows;
  }

  async getLastPolicyActionAt(client: Db, actionType: string): Promise<Date | null> {
    const r = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM mayor_actions WHERE action_type = $1 AND status = 'applied' ORDER BY created_at DESC LIMIT 1`,
      [actionType],
    );
    return r.rows[0]?.created_at ?? null;
  }
}

export const politicsRepository = new PoliticsRepository();
