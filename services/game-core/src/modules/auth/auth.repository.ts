import type { PoolClient } from 'pg';
import type { UserRole } from '@efls/contracts';
import { generateCccd } from '@efls/domain';
import { pool } from '../../shared/db/pool.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';

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
      const cashMinor = role === 'admin' ? 1_000_000_000_000 : role === 'moderator' ? 500_000_000_000 : 500_000;
      const creditScore = role === 'player' ? 650 : 800;

      await client.query(
        `INSERT INTO characters
           (id, user_id, full_name, cccd, birthplace, age, health_energy, cash_minor, credit_score, heat_level,
            marital_status, location_x, location_y)
         VALUES ($1, $2, $3, $4, $5, 18, 100, $6, $7, 0, 'single', 12, 7)`,
        [characterId, userId, input.fullName, cccd, birthplace, cashMinor, creditScore],
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
