import type { PoolClient } from 'pg';

export interface DomainEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}

/**
 * Transactional outbox for the worker. Mirrors game-core's eventBus but uses
 * the worker's own pool client so the worker stays self-contained.
 */
export async function enqueueDomainEvent(client: PoolClient, event: DomainEvent): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (id, type, aggregate_type, aggregate_id, payload, occurred_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5)`,
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
