import pg from 'pg';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Chặn query treo vô hạn khi DB bị khóa/treo, tránh giữ connection + làm
  // request của người chơi chờ tới khi nginx timeout (504).
  statement_timeout: 30_000,
  query_timeout: 30_000,
  idle_in_transaction_session_timeout: 30_000,
});

pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected PostgreSQL pool error');
});
