import type { Db } from '../db/tx.js';
import { pool } from '../db/pool.js';

export async function writeActionLog(
  db: Db,
  actorId: string | null | undefined,
  action: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const client = db as any;
  await client.query(
    `INSERT INTO action_log (id, actor_id, action, detail)
     VALUES (gen_random_uuid(), $1, $2, $3::jsonb)`,
    [actorId ?? null, action, JSON.stringify(detail)],
  );
}

export async function listActionLogs(limit = 100, offset = 0) {
  const r = await pool.query(
    `SELECT al.id,
            al.actor_id AS "actorId",
            al.action,
            al.detail,
            al.created_at AS "createdAt",
            u.username AS "actorUsername",
            u.email AS "actorEmail",
            u.role AS "actorRole",
            c.full_name AS "actorCharacterName"
       FROM action_log al
       LEFT JOIN users u ON u.id = al.actor_id
       LEFT JOIN characters c ON c.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2`,
    [Math.min(Math.max(limit, 1), 500), Math.max(offset, 0)],
  );
  return r.rows as Array<{
    id: string;
    actorId: string | null;
    action: string;
    detail: any;
    createdAt: Date;
    actorUsername: string | null;
    actorEmail: string | null;
    actorRole: string | null;
    actorCharacterName: string | null;
  }>;
}