import type { PoolClient } from 'pg';
import type { UserRole } from '@efls/contracts';
import { generateCccd } from '@efls/domain';
import { pool } from '../../shared/db/pool.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';
import { generateAccountNumber } from '../../shared/banking/accountTier.js';

export interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  status?: 'active' | 'banned' | 'restricted';
  ban_reason?: string | null;
  banned_until?: Date | null;
}

export interface NewUserInput {
  email: string;
  username: string;
  passwordHash: string;
  fullName: string;
  birthplaceCode?: string;
  role?: UserRole;
}

/** Sinh CCCD duy nhất với tiền tố tỉnh (dùng khi tạo nhân vật mới). */
async function uniqueCccd(client: PoolClient, birthplace: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateCccd(birthplace);
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM characters WHERE cccd = $1) AS exists`,
      [candidate],
    );
    if (!result.rows[0]?.exists) return candidate;
  }
  throw new Error('Không sinh được CCCD duy nhất');
}

/** Sinh số tài khoản duy nhất. */
async function uniqueAccountNumber(client: PoolClient): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateAccountNumber();
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM characters WHERE account_number = $1) AS exists`,
      [candidate],
    );
    if (!result.rows[0]?.exists) return candidate;
  }
  throw new Error('Không sinh được số tài khoản duy nhất');
}

export class AuthRepository {
  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await pool.query<UserRow>(
      `SELECT id, email, username, password_hash, role, created_at, status, ban_reason, banned_until
       FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await pool.query<UserRow>(
      `SELECT id, email, username, password_hash, role, created_at, status, ban_reason, banned_until
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

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await pool.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [userId, passwordHash]);
  }

  /**
   * Cập nhật thông tin tài khoản (username/email). Tên nhân vật (full_name) là định danh cố định,
   * chỉ được xác định khi nhân vật được sinh ra/tạo mới hoặc khi kế thừa/chọn nhân vật tiếp theo.
   */
  async updateAccountProfile(input: {
    userId: string;
    email?: string;
    username?: string;
  }): Promise<UserRow> {
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');

      if (input.email != null) {
        const taken = await client.query<{ id: string }>(
          `SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1`,
          [input.email, input.userId],
        );
        if (taken.rows[0]) {
          const err = new Error('email_taken');
          (err as any).code = 'conflict_email';
          throw err;
        }
      }
      if (input.username != null) {
        const taken = await client.query<{ id: string }>(
          `SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2 LIMIT 1`,
          [input.username, input.userId],
        );
        if (taken.rows[0]) {
          const err = new Error('username_taken');
          (err as any).code = 'conflict_username';
          throw err;
        }
      }

      const sets: string[] = [];
      const params: any[] = [input.userId];
      if (input.email != null) {
        params.push(input.email.trim().toLowerCase());
        sets.push(`email = $${params.length}`);
      }
      if (input.username != null) {
        params.push(input.username.trim());
        sets.push(`username = $${params.length}`);
      }
      sets.push(`updated_at = now()`);

      const userRes = await client.query<UserRow>(
        `UPDATE users SET ${sets.join(', ')}
         WHERE id = $1
         RETURNING id, email, username, password_hash, role, created_at, status, ban_reason, banned_until`,
        params,
      );
      const user = userRes.rows[0];
      if (!user) {
        const err = new Error('not_found');
        (err as any).code = 'not_found';
        throw err;
      }

      await client.query('COMMIT');
      return user;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async createWithCharacter(input: NewUserInput): Promise<{ user: UserRow; characterId: string }> {
    const client: PoolClient = await pool.connect();
    const userId = crypto.randomUUID();
    const characterId = crypto.randomUUID();
    const role = input.role ?? 'player';

    try {
      await client.query('BEGIN');

      const userResult = await client.query<UserRow>(
        `INSERT INTO users (id, email, username, password_hash, role)
         VALUES ($1, lower($2), $3, $4, $5)
         RETURNING id, email, username, password_hash, role, created_at`,
        [userId, input.email, input.username, input.passwordHash, role],
      );

      const user = userResult.rows[0];
      if (!user) throw new Error('User insert returned no row');

      const birthplace = input.birthplaceCode ?? '001'; // Mặc định Hà Nội khi không chọn
      const cccd = await uniqueCccd(client, birthplace);
      const accountNumber = await uniqueAccountNumber(client);
      const cashMinor = role === 'admin' ? 1_000_000_000_000 : role === 'moderator' ? 500_000_000_000 : 500_000;
      const creditScore = role === 'player' ? 650 : 800;

      await client.query(
        `INSERT INTO characters
           (id, user_id, full_name, account_number, cccd, birthplace, age, health_energy, cash_minor, credit_score, heat_level,
            marital_status, location_x, location_y, is_alive)
         VALUES ($1, $2, $3, $4, $5, $6, 18, 100, $7, $8, 0, 'single', 12, 7, true)`,
        [characterId, userId, input.fullName, accountNumber, cccd, birthplace, cashMinor, creditScore],
      );

      await enqueueDomainEvent(client, {
        type: 'user.registered.v1',
        aggregateType: 'user',
        aggregateId: userId,
        payload: { userId, characterId, email: input.email, role },
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
