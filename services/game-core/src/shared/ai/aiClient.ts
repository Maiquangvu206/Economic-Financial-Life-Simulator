import { env } from '../../config/env.js';
import { logger } from '../logger.js';

export interface AiClientResult<T> {
  data: T | null;
  latencyMs: number;
}

/**
 * Gọi AI service (fake provider mặc định) với timeout.
 * Thất bại thì trả data=null để caller fallback sang rule thuần túy.
 */
export async function callAiService<T extends object>(
  path: string,
  payload: Record<string, unknown>,
): Promise<AiClientResult<T>> {
  const url = `${env.AI_SERVICE_URL}${path}`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.AI_SERVICE_TOKEN ? { 'x-ai-token': env.AI_SERVICE_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn({ status: response.status, path }, 'AI service returned error');
      return { data: null, latencyMs: Date.now() - startedAt };
    }
    const data = (await response.json()) as T;
    return { data, latencyMs: Date.now() - startedAt };
  } catch (error) {
    logger.warn({ err: error, path }, 'AI service call failed');
    return { data: null, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}
