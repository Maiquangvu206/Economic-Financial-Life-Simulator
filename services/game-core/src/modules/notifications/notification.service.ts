import type { PoolClient } from 'pg';
import { pool } from '../../shared/db/pool.js';
import type { NotificationDto } from '@efls/contracts';

export interface NotifyInput {
  userId: string;
  kind: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

/**
 * Write an in-game notification inside the caller's transaction.
 * Notification failures must never roll back money movement, so callers that
 * cannot share a transaction should use the async variant instead.
 */
export async function notify(client: PoolClient, input: NotifyInput): Promise<void> {
  await client.query(
    `INSERT INTO notifications (id, user_id, kind, title, body, payload)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb)`,
    [input.userId, input.kind, input.title, input.body, JSON.stringify(input.payload ?? {})],
  );
}

function toDto(row: any): NotificationDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    payload: (row.payload && typeof row.payload === 'object') ? row.payload : {},
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export class NotificationService {
  async listForUser(userId: string, opts?: { limit?: number; unreadOnly?: boolean }): Promise<NotificationDto[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    const unreadOnly = !!opts?.unreadOnly;
    const r = await pool.query(
      `SELECT id, kind, title, body, payload, read_at, created_at
       FROM notifications
       WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return r.rows.map(toDto);
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    if (ids && ids.length > 0) {
      await pool.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, now())
         WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [userId, ids],
      );
    } else {
      await pool.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, now())
         WHERE user_id = $1 AND read_at IS NULL`,
        [userId],
      );
    }
  }
}
