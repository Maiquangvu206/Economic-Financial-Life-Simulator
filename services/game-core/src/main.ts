import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './shared/db/pool.js';
import { logger } from './shared/logger.js';
import { auctionService } from './modules/auctions/auction.service.js';

const app = createApp();

const server = app.listen(env.CORE_PORT, () => {
  logger.info({ port: env.CORE_PORT }, 'game-core listening');
});

// Tự kết thúc các phiên đấu giá đã hết hạn (Countdown = 0), quét mỗi 60 giây.
const auctionSweep = setInterval(() => {
  auctionService
    .autoEndExpiredAuctions()
    .then((count) => {
      if (count > 0) logger.info({ count }, 'Đã tự kết thúc phiên đấu giá hết hạn');
    })
    .catch((error) => logger.error({ error }, 'Tự kết thúc đấu giá thất bại'));
}, 60_000);
auctionSweep.unref();

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down game-core');
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
