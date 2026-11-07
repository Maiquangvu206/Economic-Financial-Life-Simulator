import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { env } from './config/env.js';
import { logger } from './logger.js';

export async function attachRedis(io: Server): Promise<{ close: () => Promise<void> }> {
  const pubClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  const subClient = pubClient.duplicate();
  const eventSubscriber = pubClient.duplicate();

  await Promise.all([pubClient.ping(), subClient.ping(), eventSubscriber.ping()]);
  io.adapter(createAdapter(pubClient, subClient));

  await eventSubscriber.subscribe(env.REALTIME_CHANNEL);
  eventSubscriber.on('message', (_channel, raw) => {
    try {
      const envelope = JSON.parse(raw) as {
        room: string;
        event: string;
        payload: unknown;
      };
      if (!envelope.room || !envelope.event) return;
      io.to(envelope.room).emit(envelope.event, envelope.payload);
    } catch (error) {
      logger.warn({ err: error }, 'Dropped malformed realtime envelope');
    }
  });

  logger.info({ channel: env.REALTIME_CHANNEL }, 'Redis adapter and subscriber ready');

  return {
    close: async () => {
      await eventSubscriber.quit();
      await subClient.quit();
      await pubClient.quit();
    },
  };
}
