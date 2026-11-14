import type { Pool, PoolClient } from 'pg';
import type { Db } from '../../shared/db/tx.js';
import type { MaritalStatus } from '@efls/contracts';
import { pool } from '../../shared/db/pool.js';

export interface CharacterRow {
  id: string;
  user_id: string;
  full_name: string;
  account_number: string;
  cccd: string | null;
  birthplace: string | null;
  birthplace_name: string | null;
  age: number;
  health_energy: number;
  cash_minor: string;
  credit_score: number;
  heat_level: number;
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
      ${alias}.heat_level, ${alias}.marital_status, ${alias}.spouse_id,
      ${alias}.location_x, ${alias}.location_y, ${alias}.created_at
    `;
  }

  async findById(characterId: string): Promise<CharacterRow | null> {
    const result = await this.db.query<CharacterRow>(
      `SELECT ${this.selectCols('c')}
       FROM characters c
       LEFT JOIN provinces p ON p.code = c.birthplace
       WHERE c.id = $1
       LIMIT 1`,
      [characterId],
    );
    return result.rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<CharacterRow | null> {
    const result = await this.db.query<CharacterRow>(
      `SELECT ${this.selectCols('c')}
       FROM characters c
       LEFT JOIN provinces p ON p.code = c.birthplace
       WHERE c.user_id = $1
       ORDER BY c.created_at ASC
       LIMIT 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async findByCccd(cccd: string): Promise<CharacterRow | null> {
    const result = await this.db.query<CharacterRow>(
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

  async listProvinces(): Promise<ProvinceRow[]> {
    const result = await this.db.query<ProvinceRow>(
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
      userId: string;
      fullName: string;
      cccd: string;
      birthplace: string;
      locationX: number;
      locationY: number;
      accountNumber: string;
    },
  ): Promise<CharacterRow> {
    const result = await client.query<CharacterRow>(
      `INSERT INTO characters
         (id, user_id, full_name, account_number, cccd, birthplace, age, health_energy, cash_minor,
          credit_score, heat_level, marital_status, location_x, location_y)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 18, 100, 500000, 650, 0, 'single', $6, $7)
       RETURNING id, user_id, full_name, account_number, cccd, birthplace, NULL::text AS birthplace_name,
                 age, health_energy, cash_minor, credit_score, heat_level,
                 marital_status, spouse_id, location_x, location_y, created_at`,
      [
        input.userId,
        input.fullName,
        input.accountNumber,
        input.cccd,
        input.birthplace,
        input.locationX,
        input.locationY,
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
                 age, health_energy, cash_minor, credit_score, heat_level,
                 marital_status, spouse_id, location_x, location_y, created_at`,
      [characterId, x, y],
    );
    return result.rows[0] ?? null;
  }
}
