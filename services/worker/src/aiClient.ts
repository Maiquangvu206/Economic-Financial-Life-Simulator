import { pool } from './db.js';
import { env } from './config/env.js';
import { logger } from './logger.js';

export interface AiCallResult<T> {
  data: T;
  latencyMs: number;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  status: 'ok' | 'error';
}

/**
 * Client gọi AI service (fake provider mặc định).
 * Đo latency + ước lượng tokens/chi phí, ghi ai_metrics để cost-latency dashboard.
 */
export async function callAi<T extends object>(
  path: string,
  task: string,
  model: string,
  promptVersion: string,
  payload: Record<string, unknown>,
): Promise<AiCallResult<T>> {
  const startedAt = Date.now();
  const url = `${env.AI_SERVICE_URL}${path}`;
  const body = JSON.stringify(payload);
  let status: 'ok' | 'error' = 'ok';
  let data = {} as T;
  let latencyMs = 0;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.AI_REQUEST_TIMEOUT_MS);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.AI_SERVICE_TOKEN ? { 'x-ai-token': env.AI_SERVICE_TOKEN } : {}),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      status = 'error';
      const text = await response.text().catch(() => '');
      logger.warn({ status: response.status, text: text.slice(0, 200) }, 'AI service error');
    } else {
      data = (await response.json()) as T;
    }
  } catch (error) {
    latencyMs = Date.now() - startedAt;
    status = 'error';
    logger.warn({ err: error, task }, 'AI call failed');
  }
  // Fake provider: tokens ≈ chars/4, chi phí $0.002 / 1k tokens (ước lượng).
  const inputTokens = Math.ceil(body.length / 4);
  const outputTokens = Math.ceil(JSON.stringify(data).length / 4);
  const costUsd = ((inputTokens + outputTokens) / 1000) * 0.002;
  await pool
    .query(
      `INSERT INTO ai_metrics
         (id, task, model, prompt_version, latency_ms, input_tokens, output_tokens, cost_usd, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [task, model, promptVersion, latencyMs, inputTokens, outputTokens, costUsd, status],
    )
    .catch((e) => logger.error({ err: e, task }, 'Failed to record ai metric'));
  return { data, latencyMs, model, promptVersion, inputTokens, outputTokens, costUsd, status };
}
