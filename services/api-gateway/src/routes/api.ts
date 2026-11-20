import type { Express } from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { requireAccessToken, requireRole } from '../middleware/auth.js';
import { rateLimitHandler } from '../middleware/rateLimit.js';
import { coreProxy } from './proxy.js';

/**
 * Auth endpoints are public but rate limited. The single login portal makes
 * up to three auth calls per sign-in (login, SSO handoff, SSO exchange).
 *
 * `skipSuccessfulRequests` cho phép các lần đăng nhập/refresh thành công
 * không chiếm quota, nhờ vậy người chơi hợp lệ không bị chặn khi đông người.
 */
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.AUTH_RATE_LIMIT_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // `/refresh` có bucket riêng rộng hơn (xem bên dưới) để tránh đăng xuất oan.
  skip: (req) => req.path === '/refresh',
  handler: rateLimitHandler,
});

/**
 * Refresh token được gọi đồng loạt khi access token hết hạn. Bucket riêng,
 * rộng hơn, và chỉ tính các lần thất bại để không chặn luồng làm mới hợp lệ.
 */
const refreshLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.REFRESH_RATE_LIMIT_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler,
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
  app.use('/api/v1/auth/refresh', refreshLimiter);
  app.use('/api/v1/auth', authLimiter, requireAccessTokenForProtectedAuth, authProxy);
  // Thông báo hệ thống hiển thị trên trang đăng nhập là công khai (không cần access token)
  app.use('/api/v1/broadcasts/login', publicBroadcastLoginProxy);
  app.use('/api/v1/admin', requireAccessToken, requireRole('admin', 'moderator'), adminProxy);
  app.use('/api', requireAccessToken, apiProxy);
}
