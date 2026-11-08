import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface AiMetricRow {
  id: string;
  task: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  status: string;
  createdAt: Date;
}

/** Truy cập ai_metrics cho cost/latency dashboard. */
export class ObservabilityRepository {
  constructor(readonly db: Db = pool) {}

  async listRecent(limit = 50): Promise<AiMetricRow[]> {
    const result = await this.db.query<AiMetricRow>(
      `SELECT id, task, model, prompt_version AS "promptVersion",
              latency_ms AS "latencyMs", input_tokens AS "inputTokens",
              output_tokens AS "outputTokens", cost_usd AS "costUsd", status,
              created_at AS "createdAt"
       FROM ai_metrics ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async aggregateByTask(): Promise<
    {
      task: string;
      totalCalls: string;
      avgLatencyMs: string;
      totalCostUsd: string;
      errors: string;
    }[]
  > {
    const result = await this.db.query(
      `SELECT task,
              COUNT(*) AS "totalCalls",
              COALESCE(AVG(latency_ms), 0) AS "avgLatencyMs",
              COALESCE(SUM(cost_usd), 0) AS "totalCostUsd",
              COUNT(*) FILTER (WHERE status = 'error') AS errors
       FROM ai_metrics
       GROUP BY task
       ORDER BY task ASC`,
    );
    return result.rows;
  }

  async outboxPending(): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM outbox_events WHERE published_at IS NULL`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

export const observabilityRepository = new ObservabilityRepository();
