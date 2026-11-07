import { z } from 'zod';
import { loadEnvFile } from './loadEnv.js';

loadEnvFile();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REALTIME_PORT: z.coerce.number().int().positive().default(5000),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  ADMIN_ORIGIN: z.string().url().default('http://localhost:5174'),
  REALTIME_CHANNEL: z.string().default('efls:realtime'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid realtime environment', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
