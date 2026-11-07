import { env } from './config/env.js';
import { logger } from './logger.js';
import { createRealtimeServer } from './server.js';
import { attachRedis } from './redis.js';

const { httpServer, io, close } = createRealtimeServer();
const redis = await attachRedis(io);

httpServer.listen(env.REALTIME_PORT, () => {
  logger.info({ port: env.REALTIME_PORT }, 'realtime listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down realtime');
  await redis.close();
  await close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
