import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface UniversityRow {
  id: string;
  name: string;
  degreeCode: string;
  field: string;
  tuitionMinor: string;
  durationMonths: number;
}

export interface DegreeRow {
  id: string;
  universityId: string;
  degreeCode: string;
  status: string;
  enrolledAt: Date;
  graduatesAt: Date;
}

export interface SkillRow {
  skill: string;
  progress: number;
}

/** Truy cập trường đại học, bằng cấp, học phí, kỹ năng. */
export class EducationRepository {
  constructor(readonly db: Db = pool) {}

  async listUniversities(db: Db = this.db): Promise<UniversityRow[]> {
    const result = await db.query<UniversityRow>(
      `SELECT id, name, degree_code AS "degreeCode", field,
              tuition_minor AS "tuitionMinor", duration_months AS "durationMonths"
       FROM universities ORDER BY name ASC`,
    );
    return result.rows;
  }

  async getUniversity(universityId: string, db: Db = this.db): Promise<UniversityRow | null> {
    const result = await db.query<UniversityRow>(
      `SELECT id, name, degree_code AS "degreeCode", field,
              tuition_minor AS "tuitionMinor", duration_months AS "durationMonths"
       FROM universities WHERE id = $1`,
      [universityId],
    );
    return result.rows[0] ?? null;
  }

  async listDegrees(characterId: string, db: Db = this.db): Promise<DegreeRow[]> {
    const result = await db.query<DegreeRow>(
      `SELECT id, university_id AS "universityId", degree_code AS "degreeCode",
              status, enrolled_at AS "enrolledAt", graduates_at AS "graduatesAt"
       FROM degrees WHERE character_id = $1 ORDER BY enrolled_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async getDegree(degreeId: string, db: Db = this.db): Promise<DegreeRow | null> {
    const result = await db.query<DegreeRow>(
      `SELECT id, university_id AS "universityId", degree_code AS "degreeCode",
              status, enrolled_at AS "enrolledAt", graduates_at AS "graduatesAt"
       FROM degrees WHERE id = $1`,
      [degreeId],
    );
    return result.rows[0] ?? null;
  }

  async createDegree(client: Db, characterId: string, university: UniversityRow): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO degrees (id, character_id, university_id, degree_code, status, graduates_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'enrolled', now() + ($4 || ' months')::interval)
       RETURNING id`,
      [characterId, university.id, university.degreeCode, String(university.durationMonths)],
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

  async upsertSkill(
    client: Db,
    characterId: string,
    skill: string,
    progress: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO skill_progress (id, character_id, skill, progress)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (character_id, skill)
       DO UPDATE SET progress = EXCLUDED.progress, updated_at = now()`,
      [characterId, skill, progress],
    );
  }
}

export const educationRepository = new EducationRepository();
