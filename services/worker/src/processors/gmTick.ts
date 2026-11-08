import { pool } from '../db.js';
import { logger } from '../logger.js';
import { callAi } from '../aiClient.js';
import { enqueueDomainEvent } from '../outboxEvents.js';
import { applyGmAdjustment, type MacroState } from '@efls/domain';

interface GmProposal {
  action: 'raise_rate' | 'cut_rate' | 'trigger_crisis' | 'stimulus' | 'do_nothing';
  magnitude: number;
  rationale: string;
}

/**
 * GM AI điều chỉnh vĩ mô theo cron:
 * - Chụp snapshot (lạm phát, thất nghiệp, cung tiền M2, vốn hóa thị trường)
 * - Gọi AI /v1/gm/propose lấy proposal
 * - Core áp biên qua @efls/domain applyGmAdjustment rồi ghi macro + directive
 */
export async function processGmTick(): Promise<{ action: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gameState = await client.query<{
      macro: MacroState;
      current_year: string;
    }>(`SELECT macro, current_year FROM game_state WHERE id = 1`);
    const macro = gameState.rows[0]?.macro ?? {
      inflationPct: 2.4,
      unemploymentPct: 5.6,
      baseRatePct: 5.0,
      gdpGrowthPct: 2.1,
      cpi: 100,
    };

    const marketCap = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(current_price_minor * 1000), 0) AS total FROM stock_tickers`,
    );
    const moneySupply = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(balance_minor), 0) AS total FROM ledger_accounts`,
    );

    const snapshot = {
      inflation_pct: macro.inflationPct ?? 0,
      unemployment_pct: macro.unemploymentPct ?? 0,
      money_supply: Number(moneySupply.rows[0]?.total ?? 0),
      market_cap: Number(marketCap.rows[0]?.total ?? 0),
    };

    const { data } = await callAi<GmProposal>(
      '/v1/gm/propose',
      'gm_economy',
      'fake',
      'gm_economy@v1',
      {
        snapshot,
        allowed_actions: ['raise_rate', 'cut_rate', 'trigger_crisis', 'stimulus', 'do_nothing'],
      },
    );

    const action = data.action ?? 'do_nothing';
    const magnitude = Math.max(0, Math.min(1, data.magnitude ?? 0));
    const { next } = applyGmAdjustment({
      action,
      magnitude,
      current: {
        inflationPct: macro.inflationPct ?? 0,
        unemploymentPct: macro.unemploymentPct ?? 0,
        baseRatePct: macro.baseRatePct ?? 5,
        gdpGrowthPct: macro.gdpGrowthPct ?? 0,
        cpi: macro.cpi ?? 100,
      },
    });

    if (action !== 'do_nothing') {
      await client.query(
        `UPDATE game_state SET macro = $1::jsonb, updated_at = now() WHERE id = 1`,
        [JSON.stringify(next)],
      );
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO gm_directives
         (id, action, magnitude, rationale, snapshot, applied)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5)
       RETURNING id`,
      [action, magnitude, data.rationale ?? '', JSON.stringify(snapshot), action !== 'do_nothing'],
    );

    await enqueueDomainEvent(client, {
      type: 'gm.directive.v1',
      aggregateType: 'gm',
      aggregateId: inserted.rows[0]!.id,
      payload: { action, magnitude, next },
    });

    await client.query('COMMIT');
    logger.info({ action, magnitude }, 'GM tick applied');
    return { action };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err: error }, 'GM tick failed');
    throw error;
  } finally {
    client.release();
  }
}
