import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

let client: Redis | null = null;

function getClient(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
    client.on('error', (err) => {
      logger.warn({ err }, 'Realtime redis publish error');
    });
  }
  return client;
}

export async function publishToRoom(room: string, event: string, payload: unknown): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    if (redis.status === 'wait' || redis.status === 'end') {
      await redis.connect();
    }
    const envelope = JSON.stringify({ room, event, payload });
    await redis.publish(env.REALTIME_CHANNEL, envelope);
  } catch (err) {
    logger.warn({ err, room, event }, 'Failed to publish realtime event');
  }
}

export async function pushNotificationToUser(
  userId: string,
  payload: { kind: string; title: string; body: string; at?: number },
): Promise<void> {
  await publishToRoom(`character_room:${userId}`, 'notification', {
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    at: payload.at ?? Date.now(),
  });
}
