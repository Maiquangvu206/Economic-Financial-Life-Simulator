import { pool } from './db.js';
import { createHealthServer } from './health.js';
import { logger } from './logger.js';
import { allQueues, queueConnection } from './queues.js';
import { publishClient } from './publisher.js';
import { scheduleJobs } from './scheduler.js';
import { createWorkers } from './workers.js';

await scheduleJobs();
const workers = createWorkers();
const health = createHealthServer();

logger.info('worker started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down worker');
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(allQueues.map((queue) => queue.close()));
  await publishClient.quit();
  await queueConnection.quit();
  await pool.end();
  await new Promise<void>((resolve) => health.close(() => resolve()));
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
