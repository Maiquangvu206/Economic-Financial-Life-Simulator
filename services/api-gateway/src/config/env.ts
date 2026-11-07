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
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid API gateway environment', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
