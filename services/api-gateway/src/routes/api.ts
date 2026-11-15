import type { Express } from 'express';
import type { Request, Response, NextFunction } from 'express';
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

const PUBLIC_AUTH_PATHS = new Set([
  '/register',
  '/login',
  '/refresh',
  '/sso/handoff',
  '/sso/exchange',
]);

function requireAccessTokenForProtectedAuth(req: Request, res: Response, next: NextFunction): void {
  // req.path ở đây là path tương đối trong mount '/api/v1/auth' (vd: '/profile', '/password')
  if (PUBLIC_AUTH_PATHS.has(req.path)) {
    next();
    return;
  }
  requireAccessToken(req as any, res, next);
}

export function mountRoutes(app: Express): void {
  const authProxy = coreProxy('/api/v1/auth');
  const adminProxy = coreProxy('/api/v1/admin');
  const publicBroadcastLoginProxy = coreProxy('/api/v1/broadcasts/login');
  const apiProxy = coreProxy('/api');

  // Auth: public cho login/register/refresh/SSO; yêu cầu access token cho các endpoint tài khoản (vd: đổi mật khẩu, cập nhật profile)
  app.use('/api/v1/auth', authLimiter, requireAccessTokenForProtectedAuth, authProxy);
  // Thông báo hệ thống hiển thị trên trang đăng nhập là công khai (không cần access token)
  app.use('/api/v1/broadcasts/login', publicBroadcastLoginProxy);
  app.use('/api/v1/admin', requireAccessToken, requireRole('admin', 'moderator'), adminProxy);
  app.use('/api', requireAccessToken, apiProxy);
}
