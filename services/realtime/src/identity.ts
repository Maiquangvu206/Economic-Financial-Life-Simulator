import type { UserRole } from '@efls/contracts';
import { pool } from './db.js';
import type { SocketActor } from './types.js';

export async function resolveSocketActor(userId: string, role: UserRole): Promise<SocketActor> {
  try {
    const res = await pool.query<{
      username: string | null;
      character_id: string | null;
      full_name: string | null;
    }>(
      `SELECT u.username,
              c.id AS character_id,
              c.full_name
       FROM users u
       LEFT JOIN LATERAL (
         SELECT id, full_name
         FROM characters ch
         WHERE ch.user_id = u.id
         ORDER BY COALESCE(ch.is_alive, true) DESC, ch.created_at DESC
         LIMIT 1
       ) c ON true
       WHERE u.id = $1
       LIMIT 1`,
      [userId],
    );
    const row = res.rows[0];
    const displayName =
      row?.full_name?.trim() ||
      row?.username?.trim() ||
      (role === 'admin' ? 'Quản trị viên' : role === 'moderator' ? 'Điều hành viên' : 'Người dùng');
    return {
      userId,
      characterId: row?.character_id ?? null,
      displayName,
      role,
      id: userId,
    };
  } catch {
    const fallback = role === 'admin' ? 'Quản trị viên' : role === 'moderator' ? 'Điều hành viên' : 'Người dùng';
    return { userId, characterId: null, displayName: fallback, role, id: userId };
  }
}
