import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface CourtCaseRow {
  id: string;
  defendantId: string;
  plaintiffType: string;
  crimeType: string;
  evidenceStrength: number;
  status: string;
  verdict: string | null;
  fineMinor: string;
  prisonDays: number;
  createdAt: Date;
  closedAt: Date | null;
}

export interface EvidenceRow {
  id: string;
  caseId: string;
  submittedById: string;
  strength: number;
  description: string;
  createdAt: Date;
}

export interface CriminalRecordRow {
  id: string;
  crimeType: string;
  fineMinor: string;
  prisonDays: number;
  convictedAt: Date;
}

export interface BlackmailRow {
  id: string;
  blackmailerId: string;
  targetId: string;
  monthlyPaymentMinor: string;
  status: string;
  expiresAt: Date | null;
}

/** Truy cập tòa án / bằng chứng / án tích / tống tiền. */
export class LawRepository {
  constructor(readonly db: Db = pool) {}

  async listCases(defendantId: string, db: Db = this.db): Promise<CourtCaseRow[]> {
    const result = await db.query<CourtCaseRow>(
      `SELECT id, defendant_id AS "defendantId", plaintiff_type AS "plaintiffType",
              crime_type AS "crimeType", evidence_strength AS "evidenceStrength",
              status, verdict, fine_minor AS "fineMinor", prison_days AS "prisonDays",
              created_at AS "createdAt", closed_at AS "closedAt"
       FROM court_cases WHERE defendant_id = $1 ORDER BY created_at DESC`,
      [defendantId],
    );
    return result.rows;
  }

  async getCase(caseId: string, db: Db = this.db): Promise<CourtCaseRow | null> {
    const result = await db.query<CourtCaseRow>(
      `SELECT id, defendant_id AS "defendantId", plaintiff_type AS "plaintiffType",
              crime_type AS "crimeType", evidence_strength AS "evidenceStrength",
              status, verdict, fine_minor AS "fineMinor", prison_days AS "prisonDays",
              created_at AS "createdAt", closed_at AS "closedAt"
       FROM court_cases WHERE id = $1`,
      [caseId],
    );
    return result.rows[0] ?? null;
  }

  async createCase(client: Db, defendantId: string, crimeType: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO court_cases (id, defendant_id, plaintiff_type, crime_type, status)
       VALUES (gen_random_uuid(), $1, 'government', $2, 'open')
       RETURNING id`,
      [defendantId, crimeType],
    );
    return result.rows[0]!.id;
  }

  async listEvidences(caseId: string, db: Db = this.db): Promise<EvidenceRow[]> {
    const result = await db.query<EvidenceRow>(
      `SELECT id, case_id AS "caseId", submitted_by AS "submittedById",
              strength, description, created_at AS "createdAt"
       FROM evidences WHERE case_id = $1 ORDER BY created_at ASC`,
      [caseId],
    );
    return result.rows;
  }

  async addEvidence(
    client: Db,
    caseId: string,
    submittedById: string,
    strength: number,
    description: string,
  ): Promise<EvidenceRow> {
    const result = await client.query<EvidenceRow>(
      `INSERT INTO evidences (id, case_id, submitted_by, strength, description)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING id, case_id AS "caseId", submitted_by AS "submittedById",
                 strength, description, created_at AS "createdAt"`,
      [caseId, submittedById, strength, description],
    );
    return result.rows[0]!;
  }

  async bumpEvidenceStrength(client: Db, caseId: string, strength: number): Promise<void> {
    await client.query(
      `UPDATE court_cases
       SET evidence_strength = LEAST(100, evidence_strength + $2), status = 'trial'
       WHERE id = $1 AND status IN ('open', 'trial')`,
      [caseId, strength],
    );
  }

  async closeCase(
    client: Db,
    caseId: string,
    verdict: string,
    fineMinor: number,
    prisonDays: number,
  ): Promise<void> {
    await client.query(
      `UPDATE court_cases
       SET status = 'closed', verdict = $2, fine_minor = $3, prison_days = $4, closed_at = now()
       WHERE id = $1`,
      [caseId, verdict, fineMinor, prisonDays],
    );
  }

  async listCriminalRecords(characterId: string): Promise<CriminalRecordRow[]> {
    const result = await this.db.query<CriminalRecordRow>(
      `SELECT id, crime_type AS "crimeType", fine_minor AS "fineMinor",
              prison_days AS "prisonDays", convicted_at AS "convictedAt"
       FROM criminal_records WHERE character_id = $1 ORDER BY convicted_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async insertCriminalRecord(
    client: Db,
    characterId: string,
    crimeType: string,
    fineMinor: number,
    prisonDays: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO criminal_records (id, character_id, crime_type, fine_minor, prison_days)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [characterId, crimeType, fineMinor, prisonDays],
    );
  }

  async listBlackmails(characterId: string): Promise<BlackmailRow[]> {
    const result = await this.db.query<BlackmailRow>(
      `SELECT id, blackmailer_id AS "blackmailerId", target_id AS "targetId",
              monthly_payment_minor AS "monthlyPaymentMinor", status, expires_at AS "expiresAt"
       FROM blackmail_contracts
       WHERE blackmailer_id = $1 OR target_id = $1
       ORDER BY created_at DESC`,
      [characterId],
    );
    return result.rows;
  }
}

export const lawRepository = new LawRepository();
