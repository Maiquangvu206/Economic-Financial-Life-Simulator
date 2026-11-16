import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export type PostingStatus = 'open' | 'closed' | 'deleted';

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
  postingStatus: PostingStatus;
  closedAt: Date | null;
  closedGameYear: number | null;
  closedGameDay: number | null;
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

export interface GameDayState {
  year: number;
  dayOfYear: number;
}

const JOB_SELECT = `
  SELECT j.id, j.title, j.industry, j.base_salary_minor AS "baseSalaryMinor",
         j.required_degree AS "requiredDegree", j.min_credit_score AS "minCreditScore",
         j.energy_cost AS "energyCost", j.openings,
         j.employer_company_id AS "companyId",
         c.name AS "companyName",
         c.owner_character_id AS "ownerCharacterId",
         ch.full_name AS "ownerName",
         c.status AS "companyStatus",
         COALESCE(j.posting_status, 'open') AS "postingStatus",
         j.closed_at AS "closedAt",
         j.closed_game_year AS "closedGameYear",
         j.closed_game_day AS "closedGameDay"
  FROM jobs j
  LEFT JOIN companies c ON c.id = j.employer_company_id
  LEFT JOIN characters ch ON ch.id = c.owner_character_id
`;

export class RecruitmentRepository {
  constructor(readonly db: Db = pool) {}

  async getGameDay(db: Db = this.db): Promise<GameDayState> {
    const res = await db.query<{ current_day: string | number; current_year: string | number }>(
      `SELECT current_day, current_year FROM game_state WHERE id = 1`,
    );
    const row = res.rows[0];
    return {
      dayOfYear: Number(row?.current_day ?? 0),
      year: Number(row?.current_year ?? 2000),
    };
  }

  async listVisibleJobs(characterId: string, db: Db = this.db): Promise<RecruitmentJobRow[]> {
    // Người chơi thấy: tin đang mở của công ty active/ipo + tin do chính mình đăng (kể cả đã đóng)
    // Tin đã "xóa" (posting_status=deleted) không hiển thị.
    const res = await db.query<RecruitmentJobRow>(
      `${JOB_SELECT}
       WHERE j.employer_company_id IS NOT NULL
         AND COALESCE(j.posting_status, 'open') <> 'deleted'
         AND (
           (
             COALESCE(j.posting_status, 'open') = 'open'
             AND j.openings > 0
             AND c.status IN ('active','ipo')
           )
           OR c.owner_character_id = $1
         )
       ORDER BY (c.owner_character_id = $1) DESC,
                CASE COALESCE(j.posting_status, 'open') WHEN 'open' THEN 0 WHEN 'closed' THEN 1 ELSE 2 END,
                j.id DESC`,
      [characterId],
    );
    return res.rows;
  }

  async getJob(jobId: string, db: Db = this.db): Promise<RecruitmentJobRow | null> {
    const res = await db.query<RecruitmentJobRow>(
      `${JOB_SELECT}
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
      `INSERT INTO jobs (id, title, industry, employer_company_id, base_salary_minor, required_degree, min_credit_score, energy_cost, openings, posting_status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'open')
       RETURNING id`,
      [input.title, input.industry, input.companyId, input.baseSalaryMinor, input.requiredDegree, input.minCreditScore, input.energyCost, input.openings],
    );
    return res.rows[0]!.id;
  }

  async applyToJob(db: Db, characterId: string, job: RecruitmentJobRow): Promise<string> {
    const updated = await db.query(
      `UPDATE jobs
          SET openings = openings - 1
        WHERE id = $1
          AND openings > 0
          AND COALESCE(posting_status, 'open') = 'open'`,
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

  async closeJobPosting(db: Db, jobId: string, ownerCharacterId: string, game: GameDayState): Promise<RecruitmentJobRow | null> {
    const res = await db.query<RecruitmentJobRow>(
      `UPDATE jobs j
          SET posting_status = 'closed',
              closed_at = COALESCE(j.closed_at, now()),
              closed_game_year = COALESCE(j.closed_game_year, $3::int),
              closed_game_day = COALESCE(j.closed_game_day, $4::int)
        FROM companies c
       WHERE j.id = $1
         AND j.employer_company_id = c.id
         AND c.owner_character_id = $2
         AND COALESCE(j.posting_status, 'open') = 'open'
       RETURNING j.id, j.title, j.industry, j.base_salary_minor AS "baseSalaryMinor",
                 j.required_degree AS "requiredDegree", j.min_credit_score AS "minCreditScore",
                 j.energy_cost AS "energyCost", j.openings,
                 j.employer_company_id AS "companyId",
                 c.name AS "companyName",
                 c.owner_character_id AS "ownerCharacterId",
                 NULL::text AS "ownerName",
                 c.status AS "companyStatus",
                 j.posting_status AS "postingStatus",
                 j.closed_at AS "closedAt",
                 j.closed_game_year AS "closedGameYear",
                 j.closed_game_day AS "closedGameDay"`,
      [jobId, ownerCharacterId, game.year, game.dayOfYear],
    );
    return res.rows[0] ?? null;
  }

  async markJobDeleted(db: Db, jobId: string): Promise<void> {
    await db.query(`UPDATE jobs SET posting_status = 'deleted' WHERE id = $1`, [jobId]);
  }

  async deleteJobRowIfUnreferenced(db: Db, jobId: string): Promise<'hard' | 'soft'> {
    const ref = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM employments WHERE job_id = $1`,
      [jobId],
    );
    if (Number(ref.rows[0]?.c ?? 0) === 0) {
      const del = await db.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
      if ((del.rowCount ?? 0) > 0) return 'hard';
    }
    await this.markJobDeleted(db, jobId);
    return 'soft';
  }
}

export const recruitmentRepository = new RecruitmentRepository();
