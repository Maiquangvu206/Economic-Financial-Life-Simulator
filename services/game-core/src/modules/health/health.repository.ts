import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface WellnessDailyRow {
  character_id: string;
  game_year: number;
  game_day: number;
  home_rest_count: number;
  last_home_rest_minute: number | null;
  medical_count: number;
  last_medical_game_year: number | null;
  last_medical_game_day: number | null;
  last_medical_minute: number | null;
  entertainment_counts: Record<string, number>;
  unemployment_claimed: boolean;
  low_income_claimed: boolean;
  low_energy_claimed: boolean;
}

export interface InsuranceEnrollmentRow {
  character_id: string;
  is_active: boolean;
  contribution_rate_pct: string | number;
  is_mandatory: boolean;
  enrolled_game_year: number;
  enrolled_game_day: number;
  updated_at: Date | null;
}

export class HealthRepository {
  constructor(public readonly db: Db = pool) {}

  async getEnrollment(characterId: string, db: Db = this.db): Promise<InsuranceEnrollmentRow | null> {
    const r = await db.query<InsuranceEnrollmentRow>(
      `SELECT character_id, is_active, contribution_rate_pct, is_mandatory, enrolled_game_year, enrolled_game_day, updated_at
       FROM health_insurance_enrollments WHERE character_id = $1`,
      [characterId],
    ).catch(() => ({ rows: [] as InsuranceEnrollmentRow[] }));
    return r.rows[0] ?? null;
  }

  async upsertEnrollment(db: Db, input: {
    characterId: string;
    isActive: boolean;
    contributionRatePct: number;
    isMandatory: boolean;
    gameYear: number;
    gameDay: number;
  }): Promise<InsuranceEnrollmentRow | null> {
    const r = await db.query<InsuranceEnrollmentRow>(
      `INSERT INTO health_insurance_enrollments
         (character_id, is_active, contribution_rate_pct, is_mandatory, enrolled_game_year, enrolled_game_day, updated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6, now(), now())
       ON CONFLICT (character_id) DO UPDATE SET
         is_active = EXCLUDED.is_active,
         contribution_rate_pct = EXCLUDED.contribution_rate_pct,
         is_mandatory = health_insurance_enrollments.is_mandatory OR EXCLUDED.is_mandatory,
         updated_at = now()
       RETURNING character_id, is_active, contribution_rate_pct, is_mandatory, enrolled_game_year, enrolled_game_day, updated_at`,
      [input.characterId, input.isActive, input.contributionRatePct, input.isMandatory, input.gameYear, input.gameDay],
    ).catch(() => ({ rows: [] as InsuranceEnrollmentRow[] }));
    return r.rows[0] ?? null;
  }

  async getOrCreateDaily(db: Db, characterId: string, gameYear: number, gameDay: number): Promise<WellnessDailyRow> {
    await db.query(
      `INSERT INTO character_wellness_daily (character_id, game_year, game_day)
       VALUES ($1,$2,$3)
       ON CONFLICT (character_id, game_year, game_day) DO NOTHING`,
      [characterId, gameYear, gameDay],
    ).catch(() => null);
    const r = await db.query<any>(
      `SELECT character_id, game_year, game_day, home_rest_count, last_home_rest_minute,
              medical_count, last_medical_game_year, last_medical_game_day, last_medical_minute,
              entertainment_counts, unemployment_claimed, low_income_claimed, low_energy_claimed
       FROM character_wellness_daily
       WHERE character_id = $1 AND game_year = $2 AND game_day = $3
       FOR UPDATE`,
      [characterId, gameYear, gameDay],
    ).catch(async () => {
      // fallback without FOR UPDATE if outside tx
      return db.query<any>(
        `SELECT character_id, game_year, game_day, home_rest_count, last_home_rest_minute,
                medical_count, last_medical_game_year, last_medical_game_day, last_medical_minute,
                entertainment_counts, unemployment_claimed, low_income_claimed, low_energy_claimed
         FROM character_wellness_daily
         WHERE character_id = $1 AND game_year = $2 AND game_day = $3`,
        [characterId, gameYear, gameDay],
      );
    });
    const row = r.rows[0];
    if (!row) {
      return {
        character_id: characterId, game_year: gameYear, game_day: gameDay,
        home_rest_count: 0, last_home_rest_minute: null, medical_count: 0,
        last_medical_game_year: null, last_medical_game_day: null, last_medical_minute: null,
        entertainment_counts: {}, unemployment_claimed: false, low_income_claimed: false, low_energy_claimed: false,
      };
    }
    return {
      character_id: row.character_id,
      game_year: Number(row.game_year),
      game_day: Number(row.game_day),
      home_rest_count: Number(row.home_rest_count ?? 0),
      last_home_rest_minute: row.last_home_rest_minute == null ? null : Number(row.last_home_rest_minute),
      medical_count: Number(row.medical_count ?? 0),
      last_medical_game_year: row.last_medical_game_year == null ? null : Number(row.last_medical_game_year),
      last_medical_game_day: row.last_medical_game_day == null ? null : Number(row.last_medical_game_day),
      last_medical_minute: row.last_medical_minute == null ? null : Number(row.last_medical_minute),
      entertainment_counts: (row.entertainment_counts && typeof row.entertainment_counts === 'object') ? row.entertainment_counts : {},
      unemployment_claimed: !!row.unemployment_claimed,
      low_income_claimed: !!row.low_income_claimed,
      low_energy_claimed: !!row.low_energy_claimed,
    };
  }

  async saveDaily(db: Db, daily: WellnessDailyRow): Promise<void> {
    await db.query(
      `UPDATE character_wellness_daily
       SET home_rest_count = $4, last_home_rest_minute = $5,
           medical_count = $6, last_medical_game_year = $7, last_medical_game_day = $8, last_medical_minute = $9,
           entertainment_counts = $10::jsonb,
           unemployment_claimed = $11, low_income_claimed = $12, low_energy_claimed = $13,
           updated_at = now()
       WHERE character_id = $1 AND game_year = $2 AND game_day = $3`,
      [
        daily.character_id, daily.game_year, daily.game_day,
        daily.home_rest_count, daily.last_home_rest_minute,
        daily.medical_count, daily.last_medical_game_year, daily.last_medical_game_day, daily.last_medical_minute,
        JSON.stringify(daily.entertainment_counts ?? {}),
        daily.unemployment_claimed, daily.low_income_claimed, daily.low_energy_claimed,
      ],
    ).catch(() => null);
  }

  async hasValidResidence(characterId: string, db: Db = this.db): Promise<boolean> {
    const r = await db.query<{ ok: boolean }>(
      `SELECT (
         EXISTS (
           SELECT 1 FROM properties p
           WHERE p.owner_character_id = $1
             AND p.status IN ('owned','listed')
             AND p.property_type IN ('apartment','house')
         )
         OR EXISTS (
           SELECT 1 FROM province_land_properties pl
           WHERE pl.owner_character_id = $1
             AND pl.status = 'owned'
             AND (pl.merged_into_property_id IS NULL)
             AND pl.property_type IN ('apartment','house','mini_apartment','boutique_hotel')
         )
         OR EXISTS (
           SELECT 1 FROM leases l
           JOIN properties p ON p.id = l.property_id
           WHERE l.tenant_character_id = $1
             AND l.status = 'active'
             AND p.property_type IN ('apartment','house')
         )
       ) AS ok`,
      [characterId],
    ).catch(() => ({ rows: [{ ok: false }] }));
    return !!r.rows[0]?.ok;
  }

  async hasActiveEmployment(characterId: string, db: Db = this.db): Promise<boolean> {
    const r = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM employments e WHERE e.character_id = $1 AND e.status IN ('active','notice_pending')
       ) AS exists`,
      [characterId],
    ).catch(() => ({ rows: [{ exists: false }] }));
    return !!r.rows[0]?.exists;
  }

  async getPeriodIncomeMinor(characterId: string, periodKey: string, db: Db = this.db): Promise<number> {
    // Best-effort: sum recorded monthly income for period; fallback 0 if table missing
    const r = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(income_minor),0)::text AS total
       FROM character_monthly_income
       WHERE character_id = $1 AND period_key = $2`,
      [characterId, periodKey],
    ).catch(() => ({ rows: [{ total: '0' }] }));
    return Number(r.rows[0]?.total ?? 0);
  }

  async hasSupportClaim(characterId: string, type: string, periodKey: string, db: Db = this.db): Promise<boolean> {
    const r = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM welfare_support_claims WHERE character_id = $1 AND support_type = $2 AND period_key = $3
       ) AS exists`,
      [characterId, type, periodKey],
    ).catch(() => ({ rows: [{ exists: false }] }));
    return !!r.rows[0]?.exists;
  }
}

export const healthRepository = new HealthRepository();
