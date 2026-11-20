import type { Request, Response } from 'express';

/**
 * Phản hồi 429 thống nhất dạng ProblemDetails để client hiển thị đúng
 * ("máy chủ đang quá tải, vui lòng thử lại") thay vì bị coi là mất phiên.
 */
export function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    type: 'https://efls.game/errors/rate-limited',
    title: 'Quá nhiều yêu cầu',
    status: 429,
    detail: 'Bạn thao tác quá nhanh hoặc hệ thống đang quá tải. Vui lòng thử lại sau vài giây.',
  });
}

export function isHealthPath(req: Request): boolean {
  return req.path === '/health' || req.path === '/healthz';
}
