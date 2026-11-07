import type { PoolClient } from 'pg';

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
