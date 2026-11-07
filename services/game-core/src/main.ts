import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './shared/db/pool.js';
import { logger } from './shared/logger.js';

const app = createApp();

const server = app.listen(env.CORE_PORT, () => {
  logger.info({ port: env.CORE_PORT }, 'game-core listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down game-core');
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
