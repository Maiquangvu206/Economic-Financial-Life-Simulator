import type { PoolClient } from 'pg';

export interface DomainEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}

/**
 * Transactional outbox.
 *
 * State change and event row are written in the same transaction. A separate
 * relay (worker) publishes outbox rows to Redis/Socket.IO and marks them sent.
 * This prevents "money moved but event lost" inconsistencies.
 */
export async function enqueueDomainEvent(client: PoolClient, event: DomainEvent): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (id, type, aggregate_type, aggregate_id, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      crypto.randomUUID(),
      event.type,
      event.aggregateType,
      event.aggregateId,
      JSON.stringify(event.payload),
      event.occurredAt ?? new Date(),
    ],
  );
}
