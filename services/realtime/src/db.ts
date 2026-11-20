import pg from 'pg';
import { env } from './config/env.js';
import { logger } from './logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Không có listener 'error' thì lỗi mạng của idle client sẽ làm process thoát.
pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected PostgreSQL pool error (realtime)');
});

export async function closePool(): Promise<void> {
  await pool.end();
}
