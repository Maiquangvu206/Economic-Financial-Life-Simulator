import { Redis } from 'ioredis';
import { env } from './config/env.js';

export const publishClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});
