import type { Pool } from 'pg';
import type { MaritalStatus } from '@efls/contracts';
import { pool } from '../../shared/db/pool.js';

export interface CharacterRow {
  id: string;
  user_id: string;
  full_name: string;
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

export class CharactersRepository {
  constructor(private readonly db: Pool = pool) {}

  async findByUserId(userId: string): Promise<CharacterRow | null> {
    const result = await this.db.query<CharacterRow>(
      `SELECT id, user_id, full_name, age, health_energy, cash_minor, credit_score,
              heat_level, marital_status, spouse_id, location_x, location_y, created_at
       FROM characters
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }
}
