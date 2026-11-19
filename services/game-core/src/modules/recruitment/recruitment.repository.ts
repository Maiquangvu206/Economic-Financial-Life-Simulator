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
  companyId: string | null;
  companyName: string | null;
  companyOwnerCharacterId: string | null;
  isOwnerRole: boolean;
  resignRequestedAt: Date | null;
  effectiveResignGameYear: number | null;
  effectiveResignGameDay: number | null;
}

export interface GameDayState {
  year: number;
  dayOfYear: number;
}

export type JobApplicationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface JobApplicationRow {
  id: string;
  jobId: string;
  jobTitle: string;
  companyId: string | null;
  companyName: string | null;
  applicantCharacterId: string;
  applicantName: string | null;
  applicantCccd: string | null;
  status: JobApplicationStatus;
  note: string | null;
  decisionNote: string | null;
  decidedByCharacterId: string | null;
  decidedAt: Date | null;
  employmentId: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  baseSalaryMinor: string | number | null;
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

  async getCurrentEmployment(characterId: string, db: Db = this.db): Promise<EmploymentRow | null> {
    const res = await db.query<EmploymentRow>(
      `SELECT e.id, e.job_id AS "jobId", j.title, j.industry, e.salary_minor AS "salaryMinor", e.status, e.hired_at AS "hiredAt",
              e.company_id AS "companyId",
              c.name AS "companyName",
              c.owner_character_id AS "companyOwnerCharacterId",
              COALESCE((to_jsonb(e)->>'is_owner_role')::boolean, false) AS "isOwnerRole",
              NULLIF(to_jsonb(e)->>'resign_requested_at','')::timestamptz AS "resignRequestedAt",
              NULLIF(to_jsonb(e)->>'effective_resign_game_year','')::int AS "effectiveResignGameYear",
              NULLIF(to_jsonb(e)->>'effective_resign_game_day','')::int AS "effectiveResignGameDay"
       FROM employments e
       JOIN jobs j ON j.id = e.job_id
       LEFT JOIN companies c ON c.id = e.company_id
       WHERE e.character_id = $1 AND e.status IN ('active', 'notice_pending')
       ORDER BY CASE e.status WHEN 'notice_pending' THEN 0 ELSE 1 END, e.hired_at DESC
       LIMIT 1`,
      [characterId],
    );
    return res.rows[0] ?? null;
  }

  /** @deprecated Use getCurrentEmployment */
  async getActiveEmployment(characterId: string, db: Db = this.db): Promise<EmploymentRow | null> {
    return this.getCurrentEmployment(characterId, db);
  }

  async requestResign(
    db: Db,
    employmentId: string,
    characterId: string,
    effectiveYear: number,
    effectiveDayOfYear: number,
  ): Promise<EmploymentRow | null> {
    const res = await db.query<EmploymentRow>(
      `UPDATE employments e
          SET status = 'notice_pending',
              resign_requested_at = now(),
              effective_resign_game_year = $3::int,
              effective_resign_game_day = $4::int
        FROM jobs j
        LEFT JOIN companies c ON c.id = e.company_id
       WHERE e.id = $1
         AND e.character_id = $2
         AND e.status = 'active'
       RETURNING e.id, e.job_id AS "jobId", j.title, j.industry, e.salary_minor AS "salaryMinor", e.status, e.hired_at AS "hiredAt",
                 e.company_id AS "companyId",
                 c.name AS "companyName",
                 c.owner_character_id AS "companyOwnerCharacterId",
                 COALESCE((to_jsonb(e)->>'is_owner_role')::boolean, false) AS "isOwnerRole",
                 NULLIF(to_jsonb(e)->>'resign_requested_at','')::timestamptz AS "resignRequestedAt",
                 NULLIF(to_jsonb(e)->>'effective_resign_game_year','')::int AS "effectiveResignGameYear",
                 NULLIF(to_jsonb(e)->>'effective_resign_game_day','')::int AS "effectiveResignGameDay"`,
      [employmentId, characterId, effectiveYear, effectiveDayOfYear],
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

  // --- Player job applications (approval workflow) ---

  async hasPendingApplication(jobId: string, applicantCharacterId: string, db: Db = this.db): Promise<boolean> {
    const res = await db.query(
      `SELECT 1 FROM job_applications WHERE job_id = $1 AND applicant_character_id = $2 AND status = 'pending' LIMIT 1`,
      [jobId, applicantCharacterId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async getPendingApplicationIdsForApplicant(applicantCharacterId: string, jobIds: string[], db: Db = this.db): Promise<Set<string>> {
    if (jobIds.length === 0) return new Set();
    const res = await db.query<{ job_id: string }>(
      `SELECT job_id FROM job_applications WHERE applicant_character_id = $1 AND status = 'pending' AND job_id = ANY($2::uuid[])`,
      [applicantCharacterId, jobIds],
    );
    return new Set(res.rows.map((r) => r.job_id));
  }

  async getPendingApplicationCountsForJobs(jobIds: string[], db: Db = this.db): Promise<Map<string, number>> {
    if (jobIds.length === 0) return new Map();
    const res = await db.query<{ job_id: string; c: string }>(
      `SELECT job_id, COUNT(*)::text AS c FROM job_applications WHERE status = 'pending' AND job_id = ANY($1::uuid[]) GROUP BY job_id`,
      [jobIds],
    );
    const map = new Map<string, number>();
    for (const r of res.rows) map.set(r.job_id, Number(r.c));
    return map;
  }

  async createJobApplication(db: Db, input: { jobId: string; companyId: string | null; applicantCharacterId: string; note?: string | null }): Promise<string> {
    const res = await db.query<{ id: string }>(
      `INSERT INTO job_applications (id, job_id, company_id, applicant_character_id, status, note)
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4)
       RETURNING id`,
      [input.jobId, input.companyId, input.applicantCharacterId, input.note ?? null],
    );
    return res.rows[0]!.id;
  }

  async listApplicationsByApplicant(applicantCharacterId: string, db: Db = this.db): Promise<JobApplicationRow[]> {
    const res = await db.query<JobApplicationRow>(
      `SELECT a.id, a.job_id AS "jobId", j.title AS "jobTitle",
              a.company_id AS "companyId", c.name AS "companyName",
              a.applicant_character_id AS "applicantCharacterId",
              ach.full_name AS "applicantName",
              ach.cccd AS "applicantCccd",
              a.status, a.note, a.decision_note AS "decisionNote",
              a.decided_by_character_id AS "decidedByCharacterId",
              a.decided_at AS "decidedAt",
              a.employment_id AS "employmentId",
              a.created_at AS "createdAt",
              a.updated_at AS "updatedAt",
              j.base_salary_minor AS "baseSalaryMinor"
       FROM job_applications a
       JOIN jobs j ON j.id = a.job_id
       LEFT JOIN companies c ON c.id = a.company_id
       LEFT JOIN characters ach ON ach.id = a.applicant_character_id
       WHERE a.applicant_character_id = $1
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [applicantCharacterId],
    );
    return res.rows;
  }

  async listIncomingApplicationsForOwner(ownerCharacterId: string, db: Db = this.db): Promise<JobApplicationRow[]> {
    const res = await db.query<JobApplicationRow>(
      `SELECT a.id, a.job_id AS "jobId", j.title AS "jobTitle",
              a.company_id AS "companyId", c.name AS "companyName",
              a.applicant_character_id AS "applicantCharacterId",
              ach.full_name AS "applicantName",
              ach.cccd AS "applicantCccd",
              a.status, a.note, a.decision_note AS "decisionNote",
              a.decided_by_character_id AS "decidedByCharacterId",
              a.decided_at AS "decidedAt",
              a.employment_id AS "employmentId",
              a.created_at AS "createdAt",
              a.updated_at AS "updatedAt",
              j.base_salary_minor AS "baseSalaryMinor"
       FROM job_applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN companies c ON c.id = COALESCE(a.company_id, j.employer_company_id)
       LEFT JOIN characters ach ON ach.id = a.applicant_character_id
       WHERE c.owner_character_id = $1
         AND a.status IN ('pending','approved','rejected','cancelled')
       ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
                a.created_at DESC
       LIMIT 200`,
      [ownerCharacterId],
    );
    return res.rows;
  }

  async getApplicationForDecision(db: Db, applicationId: string): Promise<{
    id: string;
    jobId: string;
    companyId: string | null;
    applicantCharacterId: string;
    applicantUserId: string | null;
    applicantName: string | null;
    status: JobApplicationStatus;
    jobTitle: string;
    jobIndustry: string;
    jobBaseSalaryMinor: string;
    jobRequiredDegree: string | null;
    jobMinCreditScore: number;
    jobOpenings: number;
    jobPostingStatus: string;
    jobCompanyId: string | null;
    jobCompanyStatus: string | null;
    jobCompanyName: string | null;
    ownerCharacterId: string | null;
  } | null> {
    const res = await db.query<any>(
      `SELECT a.id, a.job_id AS "jobId", a.company_id AS "companyId",
              a.applicant_character_id AS "applicantCharacterId",
              ach.user_id AS "applicantUserId",
              ach.full_name AS "applicantName",
              a.status,
              j.title AS "jobTitle",
              j.industry AS "jobIndustry",
              j.base_salary_minor AS "jobBaseSalaryMinor",
              j.required_degree AS "jobRequiredDegree",
              j.min_credit_score AS "jobMinCreditScore",
              j.openings AS "jobOpenings",
              COALESCE(j.posting_status,'open') AS "jobPostingStatus",
              j.employer_company_id AS "jobCompanyId",
              c.status AS "jobCompanyStatus",
              c.name AS "jobCompanyName",
              c.owner_character_id AS "ownerCharacterId"
       FROM job_applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN characters ach ON ach.id = a.applicant_character_id
       LEFT JOIN companies c ON c.id = COALESCE(a.company_id, j.employer_company_id)
       WHERE a.id = $1
       FOR UPDATE OF a, j`,
      [applicationId],
    );
    return res.rows[0] ?? null;
  }

  async decideApplication(db: Db, applicationId: string, input: { status: 'approved' | 'rejected'; decidedByCharacterId: string; decisionNote?: string | null; employmentId?: string | null }): Promise<void> {
    await db.query(
      `UPDATE job_applications
          SET status = $2,
              decided_by_character_id = $3,
              decision_note = $4,
              decided_at = now(),
              employment_id = $5,
              updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [applicationId, input.status, input.decidedByCharacterId, input.decisionNote ?? null, input.employmentId ?? null],
    );
  }

  async cancelPendingApplicationsForJob(db: Db, jobId: string): Promise<number> {
    const res = await db.query(
      `UPDATE job_applications
          SET status = 'cancelled', updated_at = now(), decided_at = now(), decision_note = COALESCE(decision_note, 'Đợt tuyển đã đóng hoặc không còn hiệu lực.')
        WHERE job_id = $1 AND status = 'pending'`,
      [jobId],
    );
    return res.rowCount ?? 0;
  }
}

export const recruitmentRepository = new RecruitmentRepository();
