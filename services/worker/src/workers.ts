import { Worker } from 'bullmq';
import { QUEUES, createRedis } from './queues.js';
import { logger } from './logger.js';
import { processGameTick } from './processors/gameTick.js';
import { relayOutbox } from './processors/outboxRelay.js';
import { processAiNews } from './processors/aiNews.js';

export function createWorkers(): Worker[] {
  const gameTickWorker = new Worker(QUEUES.gameTick, async () => processGameTick(), {
    connection: createRedis(),
    concurrency: 1,
  });

  const outboxWorker = new Worker(QUEUES.outboxRelay, async () => relayOutbox(), {
    connection: createRedis(),
    concurrency: 1,
  });

  const aiNewsWorker = new Worker(QUEUES.aiNews, async () => processAiNews(), {
    connection: createRedis(),
    concurrency: 1,
  });

  const workers = [gameTickWorker, outboxWorker, aiNewsWorker];
  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      logger.error({ jobId: job?.id, name: job?.name, err: error }, 'Job failed');
    });
  }

  return workers;
}
