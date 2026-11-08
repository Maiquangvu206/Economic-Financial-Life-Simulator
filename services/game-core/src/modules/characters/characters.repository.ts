import type { Pool, PoolClient } from 'pg';
import type { Db } from '../../shared/db/tx.js';
import type { MaritalStatus } from '@efls/contracts';
import { pool } from '../../shared/db/pool.js';

export interface CharacterRow {
  id: string;
  user_id: string;
  full_name: string;
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

  async findById(characterId: string): Promise<CharacterRow | null> {
    const result = await this.db.query<CharacterRow>(
      `SELECT c.id, c.user_id, c.full_name, c.cccd, c.birthplace,
              p.name AS birthplace_name,
              c.age, c.health_energy, c.cash_minor, c.credit_score,
              c.heat_level, c.marital_status, c.spouse_id,
              c.location_x, c.location_y, c.created_at
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
      `SELECT c.id, c.user_id, c.full_name, c.cccd, c.birthplace,
              p.name AS birthplace_name,
              c.age, c.health_energy, c.cash_minor, c.credit_score,
              c.heat_level, c.marital_status, c.spouse_id,
              c.location_x, c.location_y, c.created_at
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
      `SELECT c.id, c.user_id, c.full_name, c.cccd, c.birthplace,
              p.name AS birthplace_name,
              c.age, c.health_energy, c.cash_minor, c.credit_score,
              c.heat_level, c.marital_status, c.spouse_id,
              c.location_x, c.location_y, c.created_at
       FROM characters c
       LEFT JOIN provinces p ON p.code = c.birthplace
       WHERE c.cccd = $1
       LIMIT 1`,
      [cccd],
    );
    return result.rows[0] ?? null;
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

  async createCharacter(
    client: PoolClient,
    input: {
      userId: string;
      fullName: string;
      cccd: string;
      birthplace: string;
      locationX: number;
      locationY: number;
    },
  ): Promise<CharacterRow> {
    const result = await client.query<CharacterRow>(
      `INSERT INTO characters
         (id, user_id, full_name, cccd, birthplace, age, health_energy, cash_minor,
          credit_score, heat_level, marital_status, location_x, location_y)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 18, 100, 500000, 650, 0, 'single', $5, $6)
       RETURNING id, user_id, full_name, cccd, birthplace, NULL::text AS birthplace_name,
                 age, health_energy, cash_minor, credit_score, heat_level,
                 marital_status, spouse_id, location_x, location_y, created_at`,
      [
        input.userId,
        input.fullName,
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
       RETURNING id, user_id, full_name, cccd, birthplace, NULL::text AS birthplace_name,
                 age, health_energy, cash_minor, credit_score, heat_level,
                 marital_status, spouse_id, location_x, location_y, created_at`,
      [characterId, x, y],
    );
    return result.rows[0] ?? null;
  }
}
