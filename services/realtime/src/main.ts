import { env } from './config/env.js';
import { logger } from './logger.js';
import { createRealtimeServer } from './server.js';
import { startRedis } from './redis.js';
import { closePool } from './db.js';

process.on('unhandledRejection', (reason) => {
  // Không để một promise lỗi (vd: adapter Redis) kill toàn bộ realtime.
  logger.error({ err: reason }, 'unhandledRejection (realtime vẫn tiếp tục chạy)');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaughtException');
  setTimeout(() => process.exit(1), 500).unref();
});

const { httpServer, io, close } = createRealtimeServer();

// Listen TRƯỚC khi gắn Redis: dịch vụ realtime phải sẵn sàng ngay cả khi Redis
// đang restart. Adapter được gắn nền và tự thử lại.
httpServer.listen(env.REALTIME_PORT, () => {
  logger.info({ port: env.REALTIME_PORT }, 'realtime listening');
});

const redis = startRedis(io);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down realtime');
  await redis.close();
  await close();
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
