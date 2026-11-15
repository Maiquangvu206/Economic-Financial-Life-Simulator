import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './shared/db/pool.js';
import { logger } from './shared/logger.js';
import { auctionService } from './modules/auctions/auction.service.js';
import { underworldService } from './modules/underworld/underworld.service.js';

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

// AI tự động đánh giá/kích hoạt Đại án theo chu kỳ (admin vẫn có thể can thiệp thủ công).
const AI_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let aiSweepRunning = false;
const aiSweepTimer = setInterval(() => {
  if (aiSweepRunning) return;
  aiSweepRunning = true;
  void underworldService
    .evaluateSweepsWithAI({ trigger: 'periodic' })
    .then((result) => {
      if (result.executed || result.scope !== 'none') {
        logger.info({ sweep: result }, 'AI sweep evaluation applied');
      }
    })
    .catch((err) => {
      logger.warn({ err }, 'AI sweep evaluation failed');
    })
    .finally(() => {
      aiSweepRunning = false;
    });
}, AI_SWEEP_INTERVAL_MS);
(aiSweepTimer as any).unref?.();

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down game-core');
  clearInterval(aiSweepTimer);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
