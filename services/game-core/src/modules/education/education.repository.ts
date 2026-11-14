import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface UniversityRow {
  id: string;
  name: string;
  degreeCode: string;
  field: string;
  tuitionMinor: string;
  durationMonths: number;
  postGradSalaryMinor?: string | null;
}

export interface DegreeRow {
  id: string;
  universityId: string;
  universityName: string;
  degreeCode: string;
  status: string;
  enrolledAt: Date;
  graduatesAt: Date;
  durationMonths: number;
  field: string;
}

export interface SkillRow {
  skill: string;
  progress: number;
}

export interface JobRow {
  id: string;
  title: string;
  industry: string;
  baseSalaryMinor: string;
  requiredDegree: string | null;
  minCreditScore: number;
  energyCost: number;
  openings: number;
}

export interface EarlyGradTestQuestion {
  id: number;
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
}

export interface EarlyGradTestRow {
  id: string;
  degreeId: string;
  characterId: string;
  title: string;
  questions: EarlyGradTestQuestion[];
  status: 'pending' | 'passed' | 'failed' | 'expired';
  score: number | null;
  requiredScore: number;
  expiresAt: Date;
}

/** Truy cập trường đại học, bằng cấp, học phí, kỹ năng, và cấu hình giáo dục (admin). */
export class EducationRepository {
  constructor(readonly db: Db = pool) {}

  async listUniversities(db: Db = this.db): Promise<UniversityRow[]> {
    const result = await db.query<UniversityRow>(
      `SELECT u.id, u.name, u.degree_code AS "degreeCode", u.field,
              u.tuition_minor AS "tuitionMinor", u.duration_months AS "durationMonths",
              (SELECT j.base_salary_minor::text
                 FROM jobs j
                WHERE j.required_degree = u.degree_code
                ORDER BY j.base_salary_minor DESC NULLS LAST, j.id ASC
                LIMIT 1) AS "postGradSalaryMinor"
       FROM universities u
       ORDER BY u.name ASC`,
    );
    return result.rows;
  }

  async getUniversity(universityId: string, db: Db = this.db): Promise<UniversityRow | null> {
    const result = await db.query<UniversityRow>(
      `SELECT u.id, u.name, u.degree_code AS "degreeCode", u.field,
              u.tuition_minor AS "tuitionMinor", u.duration_months AS "durationMonths",
              (SELECT j.base_salary_minor::text
                 FROM jobs j
                WHERE j.required_degree = u.degree_code
                ORDER BY j.base_salary_minor DESC NULLS LAST, j.id ASC
                LIMIT 1) AS "postGradSalaryMinor"
       FROM universities u WHERE u.id = $1`,
      [universityId],
    );
    return result.rows[0] ?? null;
  }

  async listDegrees(characterId: string, db: Db = this.db): Promise<DegreeRow[]> {
    const result = await db.query<DegreeRow>(
      `SELECT d.id, d.university_id AS "universityId", u.name AS "universityName",
              d.degree_code AS "degreeCode", d.status,
              d.enrolled_at AS "enrolledAt", d.graduates_at AS "graduatesAt",
              u.duration_months AS "durationMonths", u.field
       FROM degrees d
       JOIN universities u ON u.id = d.university_id
       WHERE d.character_id = $1
       ORDER BY d.enrolled_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async getDegree(degreeId: string, db: Db = this.db): Promise<DegreeRow | null> {
    const result = await db.query<DegreeRow>(
      `SELECT d.id, d.university_id AS "universityId", u.name AS "universityName",
              d.degree_code AS "degreeCode", d.status,
              d.enrolled_at AS "enrolledAt", d.graduates_at AS "graduatesAt",
              u.duration_months AS "durationMonths", u.field
       FROM degrees d
       JOIN universities u ON u.id = d.university_id
       WHERE d.id = $1`,
      [degreeId],
    );
    return result.rows[0] ?? null;
  }

  async getDegreeForCharacter(degreeId: string, characterId: string, db: Db = this.db): Promise<DegreeRow | null> {
    const result = await db.query<DegreeRow>(
      `SELECT d.id, d.university_id AS "universityId", u.name AS "universityName",
              d.degree_code AS "degreeCode", d.status,
              d.enrolled_at AS "enrolledAt", d.graduates_at AS "graduatesAt",
              u.duration_months AS "durationMonths", u.field
       FROM degrees d
       JOIN universities u ON u.id = d.university_id
       WHERE d.id = $1 AND d.character_id = $2`,
      [degreeId, characterId],
    );
    return result.rows[0] ?? null;
  }

  async createDegree(client: Db, characterId: string, university: UniversityRow): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO degrees (id, character_id, university_id, degree_code, status, graduates_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'enrolled', now() + make_interval(months => $4))
       RETURNING id`,
      [characterId, university.id, university.degreeCode, university.durationMonths],
    );
    return result.rows[0]!.id;
  }

  async graduateDegree(client: Db, degreeId: string): Promise<void> {
    await client.query(
      `UPDATE degrees SET status = 'graduated' WHERE id = $1 AND status = 'enrolled'`,
      [degreeId],
    );
  }

  async recordTuition(
    client: Db,
    characterId: string,
    universityId: string,
    degreeId: string,
    amountMinor: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO tuition_payments (id, character_id, university_id, degree_id, amount_minor)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [characterId, universityId, degreeId, amountMinor],
    );
  }

  async totalTuitionPaid(characterId: string, db: Db = this.db): Promise<number> {
    const result = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM tuition_payments WHERE character_id = $1`,
      [characterId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async listSkills(characterId: string, db: Db = this.db): Promise<SkillRow[]> {
    const result = await db.query<SkillRow>(
      `SELECT skill, progress FROM skill_progress WHERE character_id = $1 ORDER BY progress DESC`,
      [characterId],
    );
    return result.rows;
  }

  async upsertSkill(client: Db, characterId: string, skill: string, progress: number): Promise<void> {
    await client.query(
      `INSERT INTO skill_progress (id, character_id, skill, progress)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (character_id, skill)
       DO UPDATE SET progress = EXCLUDED.progress, updated_at = now()`,
      [characterId, skill, progress],
    );
  }

  // --- Admin config ---
  async createUniversity(
    db: Db,
    input: { name: string; degreeCode: string; field: string; tuitionMinor: number; durationMonths: number },
  ): Promise<string> {
    const res = await db.query<{ id: string }>(
      `INSERT INTO universities (id, name, degree_code, field, tuition_minor, duration_months, stat_bonus)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, '{}'::jsonb)
       RETURNING id`,
      [input.name, input.degreeCode, input.field, input.tuitionMinor, input.durationMonths],
    );
    return res.rows[0]!.id;
  }

  async updateUniversity(
    db: Db,
    id: string,
    input: { name: string; degreeCode: string; field: string; tuitionMinor: number; durationMonths: number },
  ): Promise<void> {
    await db.query(
      `UPDATE universities
          SET name = $2, degree_code = $3, field = $4, tuition_minor = $5, duration_months = $6
        WHERE id = $1`,
      [id, input.name, input.degreeCode, input.field, input.tuitionMinor, input.durationMonths],
    );
  }

  async deleteUniversity(db: Db, id: string): Promise<void> {
    await db.query(`DELETE FROM universities WHERE id = $1`, [id]);
  }

  async listJobs(db: Db = this.db): Promise<JobRow[]> {
    const res = await db.query<JobRow>(
      `SELECT id, title, industry, base_salary_minor AS "baseSalaryMinor", required_degree AS "requiredDegree",
              min_credit_score AS "minCreditScore", energy_cost AS "energyCost", openings
       FROM jobs ORDER BY title ASC`,
    );
    return res.rows;
  }

  async upsertPostGradSalary(db: Db, degreeCode: string, industry: string, salaryMinor: number): Promise<void> {
    // cập nhật tất cả job yêu cầu bằng cấp này, hoặc tạo job "Việc làm sau tốt nghiệp"
    const updated = await db.query(
      `UPDATE jobs SET base_salary_minor = $2 WHERE required_degree = $1`,
      [degreeCode, salaryMinor],
    );
    if ((updated.rowCount ?? 0) === 0) {
      await db.query(
        `INSERT INTO jobs (id, title, industry, base_salary_minor, required_degree, min_credit_score, energy_cost, openings)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 10, 999)`,
        [`Việc làm sau tốt nghiệp (${degreeCode})`, industry, salaryMinor, degreeCode],
      );
    }
  }

  async createJob(
    db: Db,
    input: { title: string; industry: string; baseSalaryMinor: number; requiredDegree: string | null; minCreditScore: number; energyCost: number; openings: number },
  ): Promise<string> {
    const res = await db.query<{ id: string }>(
      `INSERT INTO jobs (id, title, industry, base_salary_minor, required_degree, min_credit_score, energy_cost, openings)
       VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.title, input.industry, input.baseSalaryMinor, input.requiredDegree, input.minCreditScore, input.energyCost, input.openings],
    );
    return res.rows[0]!.id;
  }

  async updateJob(
    db: Db,
    id: string,
    input: { title: string; industry: string; baseSalaryMinor: number; requiredDegree: string | null; minCreditScore: number; energyCost: number; openings: number },
  ): Promise<void> {
    await db.query(
      `UPDATE jobs SET title=$2, industry=$3, base_salary_minor=$4, required_degree=$5, min_credit_score=$6, energy_cost=$7, openings=$8 WHERE id=$1`,
      [id, input.title, input.industry, input.baseSalaryMinor, input.requiredDegree, input.minCreditScore, input.energyCost, input.openings],
    );
  }

  async deleteJob(db: Db, id: string): Promise<void> {
    await db.query(`DELETE FROM jobs WHERE id = $1`, [id]);
  }

  // --- Early graduation tests (AI quiz) ---
  async createEarlyGradTest(
    db: Db,
    input: { id: string; degreeId: string; characterId: string; title: string; questions: EarlyGradTestQuestion[]; requiredScore: number },
  ): Promise<void> {
    await db.query(
      `INSERT INTO education_early_grad_tests (id, degree_id, character_id, title, questions, status, required_score)
       VALUES ($1,$2,$3,$4,$5::jsonb,'pending',$6)`,
      [input.id, input.degreeId, input.characterId, input.title, JSON.stringify(input.questions), input.requiredScore],
    );
  }

  async getPendingEarlyGradTest(db: Db, testId: string, degreeId: string, characterId: string): Promise<EarlyGradTestRow | null> {
    const res = await db.query<any>(
      `SELECT id, degree_id AS "degreeId", character_id AS "characterId", title, questions, status, score,
              required_score AS "requiredScore", expires_at AS "expiresAt"
       FROM education_early_grad_tests
       WHERE id = $1 AND degree_id = $2 AND character_id = $3`,
      [testId, degreeId, characterId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      degreeId: row.degreeId,
      characterId: row.characterId,
      title: row.title,
      questions: typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions,
      status: row.status,
      score: row.score == null ? null : Number(row.score),
      requiredScore: Number(row.requiredScore),
      expiresAt: row.expiresAt,
    };
  }

  async getLatestPendingEarlyGradTest(db: Db, degreeId: string, characterId: string): Promise<EarlyGradTestRow | null> {
    const res = await db.query<any>(
      `SELECT id, degree_id AS "degreeId", character_id AS "characterId", title, questions, status, score,
              required_score AS "requiredScore", expires_at AS "expiresAt"
       FROM education_early_grad_tests
       WHERE degree_id = $1 AND character_id = $2 AND status = 'pending' AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [degreeId, characterId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      degreeId: row.degreeId,
      characterId: row.characterId,
      title: row.title,
      questions: typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions,
      status: row.status,
      score: row.score == null ? null : Number(row.score),
      requiredScore: Number(row.requiredScore),
      expiresAt: row.expiresAt,
    };
  }

  async submitEarlyGradTest(db: Db, testId: string, status: 'passed' | 'failed' | 'expired', score: number): Promise<void> {
    await db.query(
      `UPDATE education_early_grad_tests SET status = $2, score = $3, submitted_at = now() WHERE id = $1`,
      [testId, status, score],
    );
  }
}

export const educationRepository = new EducationRepository();
