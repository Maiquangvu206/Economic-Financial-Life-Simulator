import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';
import { attachActor, requireInternalToken } from './shared/http/actor.js';
import { errorHandler } from './shared/http/errorHandler.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bankingRouter } from './modules/banking/banking.routes.js';
import { charactersRouter } from './modules/characters/characters.routes.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // Core is internal; CORS exists only for local tooling.
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const header = req.headers['x-request-id'];
        const requestId =
          typeof header === 'string' && header.length > 0 ? header : crypto.randomUUID();
        res.setHeader('x-request-id', requestId);
        return requestId;
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'game-core', env: env.NODE_ENV });
  });

  app.use('/api', requireInternalToken);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/banking', attachActor, bankingRouter);
  app.use('/api/v1/characters', attachActor, charactersRouter);
  app.use('/api/v1/admin', attachActor, adminRouter);

  app.use((_req, res) => {
    res.status(404).json({
      type: 'https://efls.game/errors/not-found',
      title: 'Route not found',
      status: 404,
    });
  });

  app.use(errorHandler);

  return app;
}
