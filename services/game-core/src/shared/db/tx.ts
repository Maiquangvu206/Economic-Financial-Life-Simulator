import type { Pool, PoolClient } from 'pg';
import { pool } from './pool.js';

export type Db = Pool | PoolClient;

/**
 * Run `work` inside a single transaction.
 *
 * Every use case that writes more than one row must go through this helper so
 * a failure can never leave money, stock or property half-moved.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The original error is more useful than a failed rollback.
    }
    throw error;
  } finally {
    client.release();
  }
}

/** bigint columns come back from pg as strings; convert safely for gameplay. */
export function toMinor(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Money value ${String(value)} exceeds the safe integer range`);
  }
  return parsed;
}

export function minor(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money amount ${value} must be a safe integer in minor units`);
  }
  return String(value);
}
