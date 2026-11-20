import { z } from 'zod';
import { loadEnvFile } from './loadEnv.js';

loadEnvFile();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  GAME_TICK_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  /** Chờ tối đa khi gặp row lock (tránh treo cả tick vì 1 giao dịch khác). */
  GAME_TICK_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  /** Chặn tick chạy quá lâu làm nghẽn DB/API. */
  GAME_TICK_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  AI_NEWS_CRON: z.string().default('0 6 * * *'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AI_SERVICE_TOKEN: z.string().default(''),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  DOMAIN_EVENT_CHANNEL: z.string().default('efls:domain-events'),
  REALTIME_CHANNEL: z.string().default('efls:realtime'),
  WORKER_METRICS_PORT: z.coerce.number().int().positive().default(6060),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid worker environment', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
