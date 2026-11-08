import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface ElectionRow {
  id: string;
  office: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  winnerCandidateId: string | null;
}

export interface CandidateRow {
  id: string;
  characterId: string;
  name: string;
  votes: number;
  donationsMinor: string;
  electionId: string;
}

/** Truy cập bầu cử Thị trưởng. */
export class PoliticsRepository {
  constructor(readonly db: Db = pool) {}

  async getCurrentElection(db: Db = this.db): Promise<ElectionRow | null> {
    const result = await db.query<ElectionRow>(
      `SELECT id, office, status, starts_at AS "startsAt", ends_at AS "endsAt",
              winner_candidate_id AS "winnerCandidateId"
       FROM elections WHERE status = 'open' ORDER BY created_at DESC LIMIT 1`,
    );
    return result.rows[0] ?? null;
  }

  async getElection(electionId: string, db: Db = this.db): Promise<ElectionRow | null> {
    const result = await db.query<ElectionRow>(
      `SELECT id, office, status, starts_at AS "startsAt", ends_at AS "endsAt",
              winner_candidate_id AS "winnerCandidateId"
       FROM elections WHERE id = $1`,
      [electionId],
    );
    return result.rows[0] ?? null;
  }

  async createElection(client: Db, endsAt: Date): Promise<ElectionRow> {
    const result = await client.query<ElectionRow>(
      `INSERT INTO elections (id, office, status, ends_at)
       VALUES (gen_random_uuid(), 'mayor', 'open', $1)
       RETURNING id, office, status, starts_at AS "startsAt", ends_at AS "endsAt",
                 winner_candidate_id AS "winnerCandidateId"`,
      [endsAt],
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

  async endElection(client: Db, electionId: string, winnerId: string | null): Promise<void> {
    await client.query(
      `UPDATE elections SET status = 'ended', winner_candidate_id = $2 WHERE id = $1`,
      [electionId, winnerId],
    );
  }

  async latestElection(db: Db = this.db): Promise<ElectionRow | null> {
    const result = await db.query<ElectionRow>(
      `SELECT id, office, status, starts_at AS "startsAt", ends_at AS "endsAt",
              winner_candidate_id AS "winnerCandidateId"
       FROM elections ORDER BY created_at DESC LIMIT 1`,
    );
    return result.rows[0] ?? null;
  }
}

export const politicsRepository = new PoliticsRepository();
