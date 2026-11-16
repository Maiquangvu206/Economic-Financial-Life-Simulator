import type { Pool, PoolClient } from 'pg';
import type { Db } from '../../shared/db/tx.js';
import type { MaritalStatus } from '@efls/contracts';
import { pool } from '../../shared/db/pool.js';
import { DEFAULT_ACCOUNT_TIER_THRESHOLDS, normalizeAccountTierThresholds, type AccountTierThresholds } from '../../shared/banking/accountTier.js';

export interface CharacterRow {
  id: string;
  user_id: string | null;
  full_name: string;
  account_number: string;
  cccd: string;
  birthplace: string | null;
  birthplace_name: string | null;
  age: number;
  health_energy: number;
  cash_minor: string;
  credit_score: number;
  heat_level: number;
  is_alive: boolean;
  marital_status: MaritalStatus;
  spouse_id: string | null;
  location_x: number;
  location_y: number;
  created_at: Date;
}

export interface ProvinceRow {
  code: string;
  name: string;
  region: string;
  is_city: boolean;
}

export class CharactersRepository {
  constructor(private readonly db: Pool = pool) {}

  private selectCols(alias = 'c') {
    return `
      ${alias}.id, ${alias}.user_id, ${alias}.full_name, ${alias}.account_number, ${alias}.cccd, ${alias}.birthplace,
      p.name AS birthplace_name,
      ${alias}.age, ${alias}.health_energy, ${alias}.cash_minor, ${alias}.credit_score,
      ${alias}.heat_level, COALESCE(${alias}.is_alive, true) AS is_alive, ${alias}.marital_status, ${alias}.spouse_id,
      ${alias}.location_x, ${alias}.location_y, ${alias}.created_at
    `;
  }

  async findById(characterId: string, db: Db = this.db): Promise<CharacterRow | null> {
    const result = await db.query<CharacterRow>(
      `SELECT ${this.selectCols('c')}
       FROM characters c
       LEFT JOIN provinces p ON p.code = c.birthplace
       WHERE c.id = $1
       LIMIT 1`,
      [characterId],
    );
    return result.rows[0] ?? null;
  }

  async findByUserId(userId: string, db: Db = this.db): Promise<CharacterRow | null> {
    const result = await db.query<CharacterRow>(
      `SELECT ${this.selectCols('c')}
       FROM characters c
       LEFT JOIN provinces p ON p.code = c.birthplace
       WHERE c.user_id = $1 AND COALESCE(c.is_alive, true) = true
       ORDER BY c.created_at ASC
       LIMIT 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  /** Lấy nhân vật của user kể cả đã chết (để hiển thị màn hình kế thừa). */
  async findAnyByUserId(userId: string, db: Db = this.db): Promise<CharacterRow | null> {
    const result = await db.query<CharacterRow>(
      `SELECT ${this.selectCols('c')}
       FROM characters c
       LEFT JOIN provinces p ON p.code = c.birthplace
       WHERE c.user_id = $1
       ORDER BY COALESCE(c.is_alive, true) DESC, c.created_at DESC
       LIMIT 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async findByCccd(cccd: string, db: Db = this.db): Promise<CharacterRow | null> {
    const result = await db.query<CharacterRow>(
      `SELECT ${this.selectCols('c')}
       FROM characters c
       LEFT JOIN provinces p ON p.code = c.birthplace
       WHERE c.cccd = $1
       LIMIT 1`,
      [cccd],
    );
    return result.rows[0] ?? null;
  }

  async findByAccountNumber(accountNumber: string, db: Db = this.db): Promise<CharacterRow | null> {
    const result = await db.query<CharacterRow>(
      `SELECT ${this.selectCols('c')}
       FROM characters c
       LEFT JOIN provinces p ON p.code = c.birthplace
       WHERE c.account_number = $1
       LIMIT 1`,
      [accountNumber],
    );
    return result.rows[0] ?? null;
  }

  async getNetWorthMinor(characterId: string, db: Db = this.db): Promise<number> {
    const result = await db.query<{ net_worth: string }>(
      `SELECT (
         COALESCE(c.cash_minor, 0)
         + COALESCE((SELECT SUM(balance_minor) FROM savings_deposits sd WHERE sd.character_id = c.id AND sd.status = 'active'), 0)
         - COALESCE((SELECT SUM(outstanding_minor) FROM loans l WHERE l.borrower_id = c.id AND l.status IN ('active','grace','defaulted')), 0)
       )::bigint AS net_worth
       FROM characters c
       WHERE c.id = $1`,
      [characterId],
    );
    return Number(result.rows[0]?.net_worth ?? 0);
  }

  async getAccountTierValueMinor(characterId: string, db: Db = this.db): Promise<number> {
    // Giá trị xếp hạng cấp bậc tài khoản: tài sản ròng + bất động sản hiện có + doanh nghiệp hiện có
    const result = await db.query<{ tier_value: string }>(
      `SELECT (
         COALESCE(c.cash_minor, 0)
         + COALESCE((SELECT SUM(sd.balance_minor) FROM savings_deposits sd WHERE sd.character_id = c.id AND sd.status = 'active'), 0)
         - COALESCE((SELECT SUM(l.outstanding_minor) FROM loans l WHERE l.borrower_id = c.id AND l.status IN ('active','grace','defaulted')), 0)
         + COALESCE((SELECT SUM(p.current_value_minor) FROM properties p WHERE p.owner_character_id = c.id AND p.status IN ('owned','listed')), 0)
         + COALESCE((SELECT SUM(pl.current_value_minor) FROM province_land_properties pl WHERE pl.owner_character_id = c.id AND pl.status = 'owned'), 0)
         + COALESCE((SELECT SUM(co.valuation_minor) FROM companies co WHERE co.owner_character_id = c.id AND co.status <> 'bankrupt'), 0)
       )::bigint AS tier_value
       FROM characters c
       WHERE c.id = $1`,
      [characterId],
    );
    return Number(result.rows[0]?.tier_value ?? 0);
  }

  async getAccountTierThresholds(db: Db = this.db): Promise<AccountTierThresholds> {
    try {
      const r = await db.query<{ macro: any }>(`SELECT macro FROM game_state WHERE id = 1`);
      const macro = r.rows[0]?.macro && typeof r.rows[0].macro === 'object' ? r.rows[0].macro : {};
      const thresholds = (macro as any)?.accountTierConfig?.thresholds;
      return normalizeAccountTierThresholds(thresholds ?? DEFAULT_ACCOUNT_TIER_THRESHOLDS);
    } catch {
      return { ...DEFAULT_ACCOUNT_TIER_THRESHOLDS };
    }
  }

  async listProvinces(db: Db = this.db): Promise<ProvinceRow[]> {
    const result = await db.query<ProvinceRow>(
      `SELECT code, name, region, is_city FROM provinces ORDER BY code ASC`,
    );
    return result.rows;
  }

  async getProvince(code: string, db: Db = this.db): Promise<ProvinceRow | null> {
    const result = await db.query<ProvinceRow>(
      `SELECT code, name, region, is_city FROM provinces WHERE code = $1`,
      [code],
    );
    return result.rows[0] ?? null;
  }

  async cccdExists(cccd: string, db: Db = this.db): Promise<boolean> {
    const result = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM characters WHERE cccd = $1) AS exists`,
      [cccd],
    );
    return result.rows[0]?.exists ?? false;
  }

  async accountNumberExists(accountNumber: string, db: Db = this.db): Promise<boolean> {
    const result = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM characters WHERE account_number = $1) AS exists`,
      [accountNumber],
    );
    return result.rows[0]?.exists ?? false;
  }

  async createCharacter(
    client: PoolClient,
    input: {
      userId: string | null;
      fullName: string;
      cccd: string;
      birthplace: string;
      locationX: number;
      locationY: number;
      accountNumber: string;
      age?: number;
      cashMinor?: number;
      birthGameYear?: number | null;
      birthGameDay?: number | null;
    },
  ): Promise<CharacterRow> {
    const age = input.age ?? 18;
    let birthGameYear = input.birthGameYear ?? null;
    let birthGameDay = input.birthGameDay ?? null;
    if (birthGameYear == null || birthGameDay == null) {
      const gs = await client.query<{ current_year: string; current_day: string }>(
        `SELECT current_year, current_day FROM game_state WHERE id = 1`,
      );
      const currentYear = Number(gs.rows[0]?.current_year ?? 2000);
      const currentDay = Number(gs.rows[0]?.current_day ?? 0);
      birthGameYear = currentYear - age;
      birthGameDay = ((Math.floor(currentDay) % 360) + 360) % 360;
    }
    const result = await client.query<CharacterRow>(
      `INSERT INTO characters
         (id, user_id, full_name, account_number, cccd, birthplace, age, health_energy, cash_minor,
          credit_score, heat_level, is_alive, marital_status, location_x, location_y, birth_game_year, birth_game_day)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $8, 100, $9, 650, 0, true, 'single', $6, $7, $10, $11)
       RETURNING id, user_id, full_name, account_number, cccd, birthplace, NULL::text AS birthplace_name,
                 age, health_energy, cash_minor, credit_score, heat_level, is_alive,
                 marital_status, spouse_id, location_x, location_y, created_at`,
      [
        input.userId,
        input.fullName,
        input.accountNumber,
        input.cccd,
        input.birthplace,
        input.locationX,
        input.locationY,
        age,
        input.cashMinor ?? 500000,
        birthGameYear,
        birthGameDay,
      ],
    );
    return result.rows[0]!;
  }

  async setLocation(characterId: string, x: number, y: number): Promise<CharacterRow | null> {
    const result = await this.db.query<CharacterRow>(
      `UPDATE characters
       SET location_x = $2, location_y = $3, updated_at = now()
       WHERE id = $1
       RETURNING id, user_id, full_name, account_number, cccd, birthplace, NULL::text AS birthplace_name,
                 age, health_energy, cash_minor, credit_score, heat_level, COALESCE(is_alive,true) AS is_alive,
                 marital_status, spouse_id, location_x, location_y, created_at`,
      [characterId, x, y],
    );
    return result.rows[0] ?? null;
  }

  async listEligibleSuccessors(characterId: string, db: Db = this.db): Promise<Array<{
    id: string; cccd: string; full_name: string; age: number; relation: string; generation_level: number; health_energy: number;
  }>> {
    const res = await db.query<any>(
      `WITH RECURSIVE descendants AS (
         SELECT ft.character_id, ft.parent_id, ft.generation_level
         FROM family_trees ft
         WHERE ft.parent_id = $1
         UNION ALL
         SELECT ft.character_id, ft.parent_id, ft.generation_level
         FROM family_trees ft
         JOIN descendants d ON ft.parent_id = d.character_id
       )
       SELECT c.id, c.cccd, c.full_name, c.age, c.health_energy, d.generation_level,
              CASE WHEN d.generation_level = 1 THEN 'Con'
                   WHEN d.generation_level = 2 THEN 'Cháu'
                   WHEN d.generation_level = 3 THEN 'Chắt'
                   ELSE 'Hậu duệ' END AS relation
       FROM descendants d
       JOIN characters c ON c.id = d.character_id
       WHERE COALESCE(c.is_alive,true) = true AND c.user_id IS NULL
       ORDER BY d.generation_level ASC, c.age DESC`,
      [characterId],
    );
    return res.rows;
  }
}
