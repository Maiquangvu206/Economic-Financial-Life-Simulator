import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from './config/env.js';

/** BullMQ requires maxRetriesPerRequest = null for blocking connections. */
export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export const queueConnection = createRedis();

export const QUEUES = {
  gameTick: 'game-tick',
  outboxRelay: 'outbox-relay',
  loanInterest: 'loan-interest',
  foreclosure: 'foreclosure',
  taxAudit: 'tax-audit',
  aiNews: 'ai-news',
  gmTick: 'gm-tick',
} as const;

export const gameTickQueue = new Queue(QUEUES.gameTick, {
  connection: queueConnection,
});

export const outboxQueue = new Queue(QUEUES.outboxRelay, {
  connection: queueConnection,
});

export const loanInterestQueue = new Queue(QUEUES.loanInterest, {
  connection: queueConnection,
});

export const foreclosureQueue = new Queue(QUEUES.foreclosure, {
  connection: queueConnection,
});

export const taxAuditQueue = new Queue(QUEUES.taxAudit, {
  connection: queueConnection,
});

export const aiNewsQueue = new Queue(QUEUES.aiNews, {
  connection: queueConnection,
});

export const gmTickQueue = new Queue(QUEUES.gmTick, {
  connection: queueConnection,
});

export const allQueues = [
  gameTickQueue,
  outboxQueue,
  loanInterestQueue,
  foreclosureQueue,
  taxAuditQueue,
  aiNewsQueue,
  gmTickQueue,
];
