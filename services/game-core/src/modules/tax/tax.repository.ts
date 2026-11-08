import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface AssessmentRow {
  id: string;
  characterId: string | null;
  companyId: string | null;
  taxYear: number;
  taxableIncomeMinor: string;
  taxDueMinor: string;
  status: string;
  dueAt: Date;
  paidAt: Date | null;
}

export interface AuditRow {
  id: string;
  taxYear: number;
  riskScore: number;
  status: string;
  penaltyMinor: string;
  createdAt: Date;
}

export interface LicenseRow {
  id: string;
  companyId: string;
  licenseType: string;
  status: string;
  issuedAt: Date;
  revokedAt: Date | null;
}

/** Truy cập đánh thuế, kiểm toán, giấy phép kinh doanh. */
export class TaxRepository {
  constructor(readonly db: Db = pool) {}

  async listAssessments(characterId: string, db: Db = this.db): Promise<AssessmentRow[]> {
    const result = await db.query<AssessmentRow>(
      `SELECT id, character_id AS "characterId", company_id AS "companyId",
              tax_year AS "taxYear", taxable_income_minor AS "taxableIncomeMinor",
              tax_due_minor AS "taxDueMinor", status, due_at AS "dueAt", paid_at AS "paidAt"
       FROM tax_assessments
       WHERE character_id = $1 OR company_id IN (
         SELECT id FROM companies WHERE owner_character_id = $1
       )
       ORDER BY tax_year DESC, created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async getAssessment(assessmentId: string, db: Db = this.db): Promise<AssessmentRow | null> {
    const result = await db.query<AssessmentRow>(
      `SELECT id, character_id AS "characterId", company_id AS "companyId",
              tax_year AS "taxYear", taxable_income_minor AS "taxableIncomeMinor",
              tax_due_minor AS "taxDueMinor", status, due_at AS "dueAt", paid_at AS "paidAt"
       FROM tax_assessments WHERE id = $1`,
      [assessmentId],
    );
    return result.rows[0] ?? null;
  }

  async createAssessment(
    client: Db,
    characterId: string,
    taxYear: number,
    taxableIncomeMinor: number,
    taxDueMinor: number,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO tax_assessments
         (id, character_id, tax_year, taxable_income_minor, tax_due_minor, status, due_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'due', now() + interval '1 month')
       RETURNING id`,
      [characterId, taxYear, taxableIncomeMinor, taxDueMinor],
    );
    return result.rows[0]!.id;
  }

  async markPaid(client: Db, assessmentId: string): Promise<void> {
    await client.query(
      `UPDATE tax_assessments SET status = 'paid', paid_at = now() WHERE id = $1`,
      [assessmentId],
    );
  }

  async listAudits(characterId: string, db: Db = this.db): Promise<AuditRow[]> {
    const result = await db.query<AuditRow>(
      `SELECT id, tax_year AS "taxYear", risk_score AS "riskScore", status,
              penalty_minor AS "penaltyMinor", created_at AS "createdAt"
       FROM tax_audits WHERE character_id = $1 ORDER BY created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async createAudit(
    client: Db,
    characterId: string,
    taxYear: number,
    riskScore: number,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO tax_audits (id, character_id, tax_year, risk_score, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'open')
       RETURNING id`,
      [characterId, taxYear, riskScore],
    );
    return result.rows[0]!.id;
  }

  async resolveAudit(
    client: Db,
    auditId: string,
    status: string,
    penaltyMinor: number,
  ): Promise<void> {
    await client.query(`UPDATE tax_audits SET status = $2, penalty_minor = $3 WHERE id = $1`, [
      auditId,
      status,
      penaltyMinor,
    ]);
  }

  async listLicenses(characterId: string, db: Db = this.db): Promise<LicenseRow[]> {
    const result = await db.query<LicenseRow>(
      `SELECT l.id, l.company_id AS "companyId", l.license_type AS "licenseType",
              l.status, l.issued_at AS "issuedAt", l.revoked_at AS "revokedAt"
       FROM business_licenses l
       JOIN companies c ON c.id = l.company_id
       WHERE c.owner_character_id = $1
       ORDER BY l.issued_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async getLicense(licenseId: string, db: Db = this.db): Promise<LicenseRow | null> {
    const result = await db.query<LicenseRow>(
      `SELECT id, company_id AS "companyId", license_type AS "licenseType",
              status, issued_at AS "issuedAt", revoked_at AS "revokedAt"
       FROM business_licenses WHERE id = $1`,
      [licenseId],
    );
    return result.rows[0] ?? null;
  }

  async revokeLicense(client: Db, licenseId: string): Promise<void> {
    await client.query(
      `UPDATE business_licenses SET status = 'revoked', revoked_at = now() WHERE id = $1`,
      [licenseId],
    );
  }
}

export const taxRepository = new TaxRepository();
