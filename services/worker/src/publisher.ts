import { Redis } from 'ioredis';
import { env } from './config/env.js';
import { logger } from './logger.js';

export const publishClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 500, 10_000),
});

publishClient.on('error', (err) => {
  logger.warn({ err }, 'Worker publisher Redis error (will retry)');
});
