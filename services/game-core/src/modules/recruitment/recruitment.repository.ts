import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface RecruitmentJobRow {
  id: string;
  title: string;
  industry: string;
  baseSalaryMinor: string;
  requiredDegree: string | null;
  minCreditScore: number;
  energyCost: number;
  openings: number;
  companyId: string | null;
  companyName: string | null;
  ownerCharacterId: string | null;
  ownerName: string | null;
  companyStatus: string | null;
}

export interface EmploymentRow {
  id: string;
  jobId: string;
  title: string;
  industry: string;
  salaryMinor: string;
  status: string;
  hiredAt: Date;
}

export class RecruitmentRepository {
  constructor(readonly db: Db = pool) {}

  async listCompanyJobs(db: Db = this.db): Promise<RecruitmentJobRow[]> {
    const res = await db.query<RecruitmentJobRow>(
      `SELECT j.id, j.title, j.industry, j.base_salary_minor AS "baseSalaryMinor",
              j.required_degree AS "requiredDegree", j.min_credit_score AS "minCreditScore",
              j.energy_cost AS "energyCost", j.openings,
              j.employer_company_id AS "companyId",
              c.name AS "companyName",
              c.owner_character_id AS "ownerCharacterId",
              ch.full_name AS "ownerName",
              c.status AS "companyStatus"
       FROM jobs j
       JOIN companies c ON c.id = j.employer_company_id
       LEFT JOIN characters ch ON ch.id = c.owner_character_id
       WHERE j.employer_company_id IS NOT NULL
         AND j.openings > 0
         AND c.status IN ('active','ipo')
       ORDER BY j.id DESC`,
    );
    return res.rows;
  }

  async getJob(jobId: string, db: Db = this.db): Promise<RecruitmentJobRow | null> {
    const res = await db.query<RecruitmentJobRow>(
      `SELECT j.id, j.title, j.industry, j.base_salary_minor AS "baseSalaryMinor",
              j.required_degree AS "requiredDegree", j.min_credit_score AS "minCreditScore",
              j.energy_cost AS "energyCost", j.openings,
              j.employer_company_id AS "companyId",
              c.name AS "companyName",
              c.owner_character_id AS "ownerCharacterId",
              ch.full_name AS "ownerName",
              c.status AS "companyStatus"
       FROM jobs j
       LEFT JOIN companies c ON c.id = j.employer_company_id
       LEFT JOIN characters ch ON ch.id = c.owner_character_id
       WHERE j.id = $1`,
      [jobId],
    );
    return res.rows[0] ?? null;
  }

  async listMyCompanies(characterId: string, db: Db = this.db): Promise<Array<{ id: string; name: string; status: string }>> {
    const res = await db.query<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM companies WHERE owner_character_id = $1 AND status IN ('active','ipo') ORDER BY updated_at DESC`,
      [characterId],
    );
    return res.rows;
  }

  async getActiveEmployment(characterId: string, db: Db = this.db): Promise<EmploymentRow | null> {
    const res = await db.query<EmploymentRow>(
      `SELECT e.id, e.job_id AS "jobId", j.title, j.industry, e.salary_minor AS "salaryMinor", e.status, e.hired_at AS "hiredAt"
       FROM employments e
       JOIN jobs j ON j.id = e.job_id
       WHERE e.character_id = $1 AND e.status = 'active'
       LIMIT 1`,
      [characterId],
    );
    return res.rows[0] ?? null;
  }

  async countGraduatedDegrees(characterId: string, db: Db = this.db): Promise<number> {
    const res = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM degrees WHERE character_id = $1 AND status = 'graduated'`,
      [characterId],
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  async createCompanyJob(db: Db, input: {
    companyId: string;
    title: string;
    industry: string;
    baseSalaryMinor: number;
    requiredDegree: string | null;
    minCreditScore: number;
    energyCost: number;
    openings: number;
  }): Promise<string> {
    const res = await db.query<{ id: string }>(
      `INSERT INTO jobs (id, title, industry, employer_company_id, base_salary_minor, required_degree, min_credit_score, energy_cost, openings)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [input.title, input.industry, input.companyId, input.baseSalaryMinor, input.requiredDegree, input.minCreditScore, input.energyCost, input.openings],
    );
    return res.rows[0]!.id;
  }

  async applyToJob(db: Db, characterId: string, job: RecruitmentJobRow): Promise<string> {
    const updated = await db.query(
      `UPDATE jobs SET openings = openings - 1 WHERE id = $1 AND openings > 0`,
      [job.id],
    );
    if ((updated.rowCount ?? 0) === 0) throw new Error('JOB_NO_OPENINGS');

    const res = await db.query<{ id: string }>(
      `INSERT INTO employments (id, character_id, job_id, company_id, salary_minor, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active')
       RETURNING id`,
      [characterId, job.id, job.companyId, Number(job.baseSalaryMinor)],
    );
    return res.rows[0]!.id;
  }
}

export const recruitmentRepository = new RecruitmentRepository();
