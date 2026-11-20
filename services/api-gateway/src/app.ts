import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { isHealthPath, rateLimitHandler } from './middleware/rateLimit.js';
import { mountRoutes } from './routes/api.js';

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
});

export function createApp(): Express {
  const app = express();

  // Gateway nằm sau Tailscale Serve + nginx. Không cấu hình trust proxy thì
  // `req.ip` luôn là IP của nginx => tất cả người chơi dùng chung một xô
  // rate limit (429 hàng loạt). Số hop phải khớp topology triển khai.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'];
        const requestId = typeof id === 'string' && id.length > 0 ? id : crypto.randomUUID();
        res.setHeader('x-request-id', requestId);
        return requestId;
      },
    }),
  );

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: env.RATE_LIMIT_PER_MIN,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: isHealthPath,
      handler: rateLimitHandler,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'api-gateway' });
  });

  mountRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({
      type: 'https://efls.game/errors/not-found',
      title: 'Route not found',
      status: 404,
    });
  });

  return app;
}
