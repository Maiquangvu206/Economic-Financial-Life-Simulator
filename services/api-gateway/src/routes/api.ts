import type { Express } from 'express';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAccessToken, requireRole } from '../middleware/auth.js';
import { coreProxy } from './proxy.js';

/**
 * Auth endpoints are public but rate limited. The single login portal makes
 * up to three auth calls per sign-in (login, SSO handoff, SSO exchange).
 */
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
});

export function mountRoutes(app: Express): void {
  const authProxy = coreProxy('/api/v1/auth');
  const adminProxy = coreProxy('/api/v1/admin');
  const apiProxy = coreProxy('/api');

  app.use('/api/v1/auth', authLimiter, authProxy);
  app.use('/api/v1/admin', requireAccessToken, requireRole('admin', 'moderator'), adminProxy);
  app.use('/api', requireAccessToken, apiProxy);
}
