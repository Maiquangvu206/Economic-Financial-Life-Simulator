import { pool } from './db.js';
import { createHealthServer } from './health.js';
import { logger } from './logger.js';
import { allQueues, queueConnection } from './queues.js';
import { publishClient } from './publisher.js';
import { scheduleJobs } from './scheduler.js';
import { createWorkers } from './workers.js';

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandledRejection (worker vẫn tiếp tục chạy)');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaughtException');
  setTimeout(() => process.exit(1), 500).unref();
});

// Redis có thể chưa sẵn sàng lúc container khởi động; thử lại thay vì crash loop.
for (;;) {
  try {
    await scheduleJobs();
    break;
  } catch (error) {
    logger.error({ err: error }, 'Không lên lịch được job; thử lại sau 5s');
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

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
