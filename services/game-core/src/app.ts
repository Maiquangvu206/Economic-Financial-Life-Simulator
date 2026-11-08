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
import { mapRouter } from './modules/map/map.routes.js';
import { realEstateRouter } from './modules/real-estate/real-estate.routes.js';
import { auctionRouter } from './modules/auctions/auction.routes.js';
import { corporationRouter } from './modules/corporations/corporation.routes.js';
import { stockMarketRouter } from './modules/stock-market/stock-market.routes.js';
import { socialRouter } from './modules/social/social.routes.js';
import { lawRouter } from './modules/law/law.routes.js';
import { educationRouter } from './modules/education/education.routes.js';
import { taxRouter } from './modules/tax/tax.routes.js';
import { underworldRouter } from './modules/underworld/underworld.routes.js';
import { npcRouter } from './modules/npc/npc.routes.js';
import { gmRouter } from './modules/gm/gm.routes.js';
import { observabilityRouter } from './modules/observability/observability.routes.js';
import { politicsRouter } from './modules/politics/politics.routes.js';
import { observabilityService } from './modules/observability/observability.service.js';

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

  // Observability: số request đã xử lý (in-memory counter cho Prometheus scrape).
  let httpRequestsTotal = 0;
  app.use((_req, _res, next) => {
    httpRequestsTotal += 1;
    next();
  });

  app.get('/metrics', async (_req, res) => {
    try {
      const outboxPending = await observabilityService.getOutboxPending();
      res
        .type('text/plain')
        .send(
          [
            '# HELP efls_http_requests_total Total HTTP requests served by game-core',
            '# TYPE efls_http_requests_total counter',
            `efls_http_requests_total ${httpRequestsTotal}`,
            '# HELP efls_outbox_pending Outbox rows awaiting relay',
            '# TYPE efls_outbox_pending gauge',
            `efls_outbox_pending ${outboxPending}`,
            '# HELP efls_uptime_seconds Game-core uptime in seconds',
            '# TYPE efls_uptime_seconds gauge',
            `efls_uptime_seconds ${Math.floor(process.uptime())}`,
          ].join('\n'),
        );
    } catch {
      res.status(500).send('metrics unavailable');
    }
  });

  app.use('/api', requireInternalToken);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/banking', attachActor, bankingRouter);
  app.use('/api/v1/characters', attachActor, charactersRouter);
  app.use('/api/v1/map', mapRouter);
  app.use('/api/v1/real-estate', realEstateRouter);
  app.use('/api/v1/auctions', auctionRouter);
  app.use('/api/v1/corporations', corporationRouter);
  app.use('/api/v1/stock-market', stockMarketRouter);
  app.use('/api/v1/social', socialRouter);
  app.use('/api/v1/law', lawRouter);
  app.use('/api/v1/education', educationRouter);
  app.use('/api/v1/tax', taxRouter);
  app.use('/api/v1/underworld', underworldRouter);
  app.use('/api/v1/npc', npcRouter);
  app.use('/api/v1/gm', gmRouter);
  app.use('/api/v1/observability', observabilityRouter);
  app.use('/api/v1/politics', politicsRouter);
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
