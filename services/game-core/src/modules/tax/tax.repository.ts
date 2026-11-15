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

export interface ActiveEmploymentRow {
  id: string;
  jobId: string;
  title: string;
  salaryMinor: string;
  companyId: string | null;
  hiredAt: Date;
}

export interface CompanyLicenseStatusRow {
  companyId: string;
  companyName: string;
  ownerCharacterId: string;
  ownerName: string;
  licenseId: string | null;
  licenseType: string | null;
  licenseStatus: string | null;
  issuedAt: Date | null;
  hasActiveLicense: boolean;
}

export interface CompanyBasicRow {
  id: string;
  name: string;
  ownerCharacterId: string;
  ownerName: string;
  ownerUserId: string;
  cashMinor: string;
  status: string;
}

/** Truy cập thuế cá nhân, kiểm toán, giấy phép kinh doanh và tuân thủ giấy phép DN. */
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

  async getAssessmentForCharacterYear(
    characterId: string,
    taxYear: number,
    db: Db = this.db,
  ): Promise<AssessmentRow | null> {
    const result = await db.query<AssessmentRow>(
      `SELECT id, character_id AS "characterId", company_id AS "companyId",
              tax_year AS "taxYear", taxable_income_minor AS "taxableIncomeMinor",
              tax_due_minor AS "taxDueMinor", status, due_at AS "dueAt", paid_at AS "paidAt"
       FROM tax_assessments
       WHERE character_id = $1 AND company_id IS NULL AND tax_year = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [characterId, taxYear],
    );
    return result.rows[0] ?? null;
  }

  async createAssessment(
    client: Db,
    characterId: string,
    taxYear: number,
    taxableIncomeMinor: number,
    taxDueMinor: number,
  ): Promise<string | null> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO tax_assessments
         (id, character_id, tax_year, taxable_income_minor, tax_due_minor, status, due_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'due', now() + interval '1 month')
       ON CONFLICT (character_id, tax_year) WHERE character_id IS NOT NULL AND company_id IS NULL
       DO NOTHING
       RETURNING id`,
      [characterId, taxYear, taxableIncomeMinor, taxDueMinor],
    );
    return result.rows[0]?.id ?? null;
  }

  async markPaid(client: Db, assessmentId: string): Promise<void> {
    await client.query(
      `UPDATE tax_assessments SET status = 'paid', paid_at = now() WHERE id = $1`,
      [assessmentId],
    );
  }

  /** Công việc cá nhân đang giữ (active employments) - dùng làm cơ sở tính thuế cá nhân. */
  async listActiveEmployments(characterId: string, db: Db = this.db): Promise<ActiveEmploymentRow[]> {
    const result = await db.query<ActiveEmploymentRow>(
      `SELECT e.id,
              e.job_id AS "jobId",
              COALESCE(j.title, 'Công việc') AS title,
              e.salary_minor AS "salaryMinor",
              e.company_id AS "companyId",
              e.hired_at AS "hiredAt"
       FROM employments e
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.character_id = $1 AND e.status = 'active'
       ORDER BY e.hired_at DESC`,
      [characterId],
    );
    return result.rows;
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

  /** Công ty do nhân vật sở hữu và trạng thái giấy phép gần nhất (phục vụ (a) phía người chơi). */
  async listOwnedCompanyLicenseStatuses(
    characterId: string,
    db: Db = this.db,
  ): Promise<CompanyLicenseStatusRow[]> {
    const result = await db.query<CompanyLicenseStatusRow>(
      `SELECT c.id AS "companyId",
              c.name AS "companyName",
              c.owner_character_id AS "ownerCharacterId",
              ch.full_name AS "ownerName",
              l.id AS "licenseId",
              l.license_type AS "licenseType",
              l.status AS "licenseStatus",
              l.issued_at AS "issuedAt",
              COALESCE((
                SELECT EXISTS(
                  SELECT 1 FROM business_licenses bl
                  WHERE bl.company_id = c.id AND bl.status = 'active'
                )
              ), false) AS "hasActiveLicense"
       FROM companies c
       JOIN characters ch ON ch.id = c.owner_character_id
       LEFT JOIN LATERAL (
         SELECT id, license_type, status, issued_at
         FROM business_licenses
         WHERE company_id = c.id
         ORDER BY (status = 'active') DESC, issued_at DESC
         LIMIT 1
       ) l ON true
       WHERE c.owner_character_id = $1 AND c.status <> 'bankrupt'
       ORDER BY c.name ASC`,
      [characterId],
    );
    return result.rows;
  }

  /** Danh sách công ty chưa có giấy phép hoạt động (phục vụ phát hiện/tố cáo). */
  async listUnlicensedCompanies(db: Db = this.db): Promise<CompanyLicenseStatusRow[]> {
    const result = await db.query<CompanyLicenseStatusRow>(
      `SELECT c.id AS "companyId",
              c.name AS "companyName",
              c.owner_character_id AS "ownerCharacterId",
              ch.full_name AS "ownerName",
              NULL::uuid AS "licenseId",
              NULL::text AS "licenseType",
              NULL::text AS "licenseStatus",
              NULL::timestamptz AS "issuedAt",
              false AS "hasActiveLicense"
       FROM companies c
       JOIN characters ch ON ch.id = c.owner_character_id
       WHERE c.status <> 'bankrupt'
         AND NOT EXISTS (
           SELECT 1 FROM business_licenses bl
           WHERE bl.company_id = c.id AND bl.status = 'active'
         )
       ORDER BY c.name ASC`,
    );
    return result.rows;
  }

  async getCompanyBasic(companyId: string, db: Db = this.db): Promise<CompanyBasicRow | null> {
    const result = await db.query<CompanyBasicRow>(
      `SELECT c.id,
              c.name,
              c.owner_character_id AS "ownerCharacterId",
              ch.full_name AS "ownerName",
              ch.user_id AS "ownerUserId",
              c.cash_minor AS "cashMinor",
              c.status
       FROM companies c
       JOIN characters ch ON ch.id = c.owner_character_id
       WHERE c.id = $1`,
      [companyId],
    );
    return result.rows[0] ?? null;
  }

  async companyHasActiveLicense(companyId: string, db: Db = this.db): Promise<boolean> {
    const result = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM business_licenses WHERE company_id = $1 AND status = 'active'
       ) AS exists`,
      [companyId],
    );
    return Boolean(result.rows[0]?.exists);
  }

  async issueLicense(
    client: Db,
    companyId: string,
    licenseType = 'Giấy phép kinh doanh',
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO business_licenses (company_id, license_type, status)
       VALUES ($1, $2, 'active')
       RETURNING id`,
      [companyId, licenseType],
    );
    return result.rows[0]!.id;
  }
}

export const taxRepository = new TaxRepository();
