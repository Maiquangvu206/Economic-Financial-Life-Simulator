import { logger } from '../logger.js';

export interface GameTickResult {
  tick: number;
  inGameYear: number;
  applied: string[];
}

let tick = 0;

/**
 * The single entry point for a 1-day real-time = 1-year in-game tick.
 *
 * Ordering is intentionally fixed. Each step will be moved into its owning
 * module and executed in a transaction with idempotency keys:
 *   1. aging / health / lifespan
 *   2. loan interest, grace period, foreclosure queue
 *   3. property depreciation and rent collection
 *   4. company OPEX, payroll and dividends
 *   5. tax audit sweep
 *   6. macro indicators + GM AI proposal (advisory)
 *   7. offline recap snapshot
 */
export async function processGameTick(): Promise<GameTickResult> {
  tick += 1;
  logger.info({ tick }, 'Game tick started');

  // TODO: wire the ordered jobs above. This scaffold deliberately does not
  // mutate money until each owning module has tests and a migration.
  logger.warn({ tick }, 'Game tick has no domain jobs wired yet');

  return { tick, inGameYear: tick, applied: [] };
}
