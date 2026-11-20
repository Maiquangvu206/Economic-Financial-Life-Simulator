import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { env } from './config/env.js';
import { logger } from './logger.js';

export interface RealtimeRedis {
  /** Đã gắn Redis adapter và subscribe kênh sự kiện chưa. */
  isReady: () => boolean;
  close: () => Promise<void>;
}

const RETRY_MS = 5_000;

/**
 * Gắn Redis adapter theo kiểu "best effort".
 *
 * Trước đây realtime `await` ping Redis trước khi listen: Redis chập chờn là
 * process không khởi động được (hoặc crash vì ioredis phát 'error' không có
 * listener) => toàn bộ người chơi mất kết nối. Nay:
 *  - luôn listen trước, Redis gắn sau;
 *  - mọi client đều có listener 'error';
 *  - nếu Redis chưa sẵn sàng, realtime vẫn chạy đơn instance và tự thử lại.
 */
export function startRedis(io: Server): RealtimeRedis {
  const options = {
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
  };
  const pubClient = new Redis(env.REDIS_URL, options);
  const subClient = pubClient.duplicate();
  const eventSubscriber = pubClient.duplicate();
  const clients = [pubClient, subClient, eventSubscriber];

  const named: Array<[string, Redis]> = [
    ['pub', pubClient],
    ['sub', subClient],
    ['events', eventSubscriber],
  ];
  for (const [name, client] of named) {
    // ioredis phát 'error' mỗi lần mất kết nối; không có listener sẽ làm
    // EventEmitter ném lỗi và kill process.
    client.on('error', (err) => {
      logger.warn({ err, client: name }, 'Redis client error (degraded, will retry)');
    });
    client.on('ready', () => logger.info({ client: name }, 'Redis client ready'));
    client.on('end', () => logger.warn({ client: name }, 'Redis client closed'));
  }

  // Đăng ký listener MỘT lần. ioredis tự subscribe lại kênh sau khi reconnect.
  eventSubscriber.on('message', (_channel, raw) => {
    try {
      const envelope = JSON.parse(raw) as { room: string; event: string; payload: unknown };
      if (!envelope.event) return;
      if (envelope.room === '*' || envelope.room === '__broadcast__') {
        io.emit(envelope.event, envelope.payload);
        return;
      }
      if (!envelope.room) return;
      io.to(envelope.room).emit(envelope.event, envelope.payload);
    } catch (error) {
      logger.warn({ err: error }, 'Dropped malformed realtime envelope');
    }
  });

  let attached = false;
  let closed = false;
  let retryTimer: NodeJS.Timeout | null = null;

  async function tryAttach(): Promise<void> {
    if (closed || attached) return;
    try {
      await Promise.all(clients.map((client) => client.ping()));
      io.adapter(createAdapter(pubClient, subClient));
      await eventSubscriber.subscribe(env.REALTIME_CHANNEL);
      attached = true;
      logger.info({ channel: env.REALTIME_CHANNEL }, 'Redis adapter and subscriber ready');
    } catch (error) {
      logger.warn(
        { err: error },
        'Redis chưa sẵn sàng; realtime tiếp tục chạy đơn instance và sẽ thử lại',
      );
      if (!closed && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void tryAttach();
        }, RETRY_MS);
        retryTimer.unref?.();
      }
    }
  }

  void tryAttach();

  return {
    isReady: () => attached,
    close: async () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      await Promise.allSettled(clients.map((client) => client.quit()));
    },
  };
}
