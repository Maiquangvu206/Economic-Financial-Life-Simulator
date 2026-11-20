import { z } from 'zod';
import { loadEnvFile } from './loadEnv.js';

loadEnvFile();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  CORE_URL: z.string().url().default('http://localhost:4000'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  ADMIN_ORIGIN: z.string().url().default('http://localhost:5174'),
  JWT_ACCESS_SECRET: z.string().min(16),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  /**
   * Số hop proxy tin cậy phía trước gateway (Tailscale Serve + nginx = 2).
   * Cần thiết để `req.ip` là IP người chơi thay vì IP nginx, tránh mọi người
   * chơi dùng chung một "xô" rate limit.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(2),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(900),
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  REFRESH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  PROXY_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid API gateway environment', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
