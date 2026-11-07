import type { PoolClient } from 'pg';
import type { UserRole } from '@efls/contracts';
import { pool } from '../../shared/db/pool.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';

export interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}

export interface NewUserInput {
  email: string;
  username: string;
  passwordHash: string;
  fullName: string;
}

export class AuthRepository {
  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await pool.query<UserRow>(
      `SELECT id, email, username, password_hash, role, created_at
       FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await pool.query<UserRow>(
      `SELECT id, email, username, password_hash, role, created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async emailExists(email: string): Promise<boolean> {
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower($1)) AS exists`,
      [email],
    );
    return result.rows[0]?.exists ?? false;
  }

  async createWithCharacter(input: NewUserInput): Promise<{ user: UserRow; characterId: string }> {
    const client: PoolClient = await pool.connect();
    const userId = crypto.randomUUID();
    const characterId = crypto.randomUUID();

    try {
      await client.query('BEGIN');

      const userResult = await client.query<UserRow>(
        `INSERT INTO users (id, email, username, password_hash, role)
         VALUES ($1, lower($2), $3, $4, 'player')
         RETURNING id, email, username, password_hash, role, created_at`,
        [userId, input.email, input.username, input.passwordHash],
      );

      const user = userResult.rows[0];
      if (!user) throw new Error('User insert returned no row');

      await client.query(
        `INSERT INTO characters
           (id, user_id, full_name, age, health_energy, cash_minor, credit_score, heat_level,
            marital_status, location_x, location_y)
         VALUES ($1, $2, $3, 18, 100, 500000, 650, 0, 'single', 12, 7)`,
        [characterId, userId, input.fullName],
      );

      await enqueueDomainEvent(client, {
        type: 'user.registered.v1',
        aggregateType: 'user',
        aggregateId: userId,
        payload: { userId, characterId, email: input.email },
      });

      await client.query('COMMIT');
      return { user, characterId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
