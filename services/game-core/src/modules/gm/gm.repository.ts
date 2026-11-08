import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface GmDirectiveRow {
  id: string;
  action: string;
  magnitude: string;
  rationale: string;
  snapshot: Record<string, unknown>;
  applied: boolean;
  createdAt: Date;
}

/** Truy cập chỉ thị GM + macro snapshot. */
export class GmRepository {
  constructor(readonly db: Db = pool) {}

  async getMacro(db: Db = this.db): Promise<Record<string, number>> {
    const result = await db.query<{ macro: Record<string, number> }>(
      `SELECT macro FROM game_state WHERE id = 1`,
    );
    return (
      result.rows[0]?.macro ?? {
        inflationPct: 2.4,
        unemploymentPct: 5.6,
        baseRatePct: 5.0,
        gdpGrowthPct: 2.1,
        cpi: 100,
      }
    );
  }

  async setMacro(client: Db, macro: Record<string, number> | object): Promise<void> {
    await client.query(`UPDATE game_state SET macro = $1::jsonb, updated_at = now() WHERE id = 1`, [
      JSON.stringify(macro),
    ]);
  }

  async marketCap(db: Db = this.db): Promise<number> {
    const result = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(current_price_minor * 1000), 0) AS total FROM stock_tickers`,
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async moneySupply(db: Db = this.db): Promise<number> {
    const result = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(balance_minor), 0) AS total FROM ledger_accounts`,
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async insertDirective(
    client: Db,
    action: string,
    magnitude: number,
    rationale: string,
    snapshot: Record<string, unknown>,
    applied: boolean,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO gm_directives (id, action, magnitude, rationale, snapshot, applied)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5)
       RETURNING id`,
      [action, magnitude, rationale, JSON.stringify(snapshot), applied],
    );
    return result.rows[0]!.id;
  }

  async listDirectives(db: Db = this.db): Promise<GmDirectiveRow[]> {
    const result = await db.query<GmDirectiveRow>(
      `SELECT id, action, magnitude, rationale, snapshot, applied, created_at AS "createdAt"
       FROM gm_directives ORDER BY created_at DESC LIMIT 20`,
    );
    return result.rows;
  }
}

export const gmRepository = new GmRepository();
