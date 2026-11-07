import { pool } from '../db.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { publishClient } from '../publisher.js';

interface OutboxRow {
  id: string;
  type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

/**
 * Relays committed outbox rows to Redis. At-least-once delivery:
 * consumers must be idempotent by event id.
 *
 * Domain events are published on `efls:domain-events`. Realtime projections
 * are a separate concern; a projection worker maps them to room envelopes.
 */
export async function relayOutbox(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<OutboxRow>(
      `SELECT id, type, aggregate_type, aggregate_id, payload, occurred_at
       FROM outbox_events
       WHERE published_at IS NULL
       ORDER BY occurred_at ASC
       LIMIT 100
       FOR UPDATE SKIP LOCKED`,
    );

    for (const row of result.rows) {
      await publishClient.publish(
        env.DOMAIN_EVENT_CHANNEL,
        JSON.stringify({
          id: row.id,
          type: row.type,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          payload: row.payload,
          occurredAt: row.occurred_at.toISOString(),
        }),
      );

      await client.query(
        `UPDATE outbox_events
         SET published_at = now(), attempts = attempts + 1
         WHERE id = $1`,
        [row.id],
      );
    }

    await client.query('COMMIT');
    if (result.rowCount && result.rowCount > 0) {
      logger.info({ count: result.rowCount }, 'Outbox events relayed');
    }
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error }, 'Outbox relay failed');
    throw error;
  } finally {
    client.release();
  }
}
