import { env } from './config/env.js';
import { logger } from './logger.js';
import { aiNewsQueue, gameTickQueue, gmTickQueue, outboxQueue } from './queues.js';

export async function scheduleJobs(): Promise<void> {
  await gameTickQueue.add(
    'game-tick',
    {},
    {
      repeat: { every: env.GAME_TICK_INTERVAL_MS },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );

  await outboxQueue.add(
    'relay',
    {},
    {
      repeat: { every: 1_000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );

  await aiNewsQueue.add(
    'daily-news',
    {},
    {
      repeat: { pattern: env.AI_NEWS_CRON },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );

  await gmTickQueue.add(
    'gm-tick',
    {},
    {
      repeat: { every: 3_600_000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );

  logger.info(
    {
      tickEveryMs: env.GAME_TICK_INTERVAL_MS,
      newsCron: env.AI_NEWS_CRON,
    },
    'Repeatable jobs scheduled',
  );
}
