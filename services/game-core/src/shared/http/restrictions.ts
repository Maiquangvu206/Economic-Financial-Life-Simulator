import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from './errors.js';

// Endpoints allowed for restricted (player) accounts so they can see restriction notice/contact info
const RESTRICTED_ALLOWLIST: Array<{ method: string; test: (path: string) => boolean }> = [
  { method: 'GET', test: (p) => p === '/api/v1/game-config' },
  { method: 'GET', test: (p) => p === '/api/v1/broadcasts/active' },
  { method: 'GET', test: (p) => p.startsWith('/api/v1/notifications') },
];

export async function enforceNotRestricted(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const actorId = req.actorId;
    if (!actorId) return next();
    if (req.actorRole !== 'player') return next();

    const r = await pool.query<{ status: string; ban_reason: string | null }>(
      `SELECT status, ban_reason FROM users WHERE id = $1 LIMIT 1`,
      [actorId],
    );
    const row = r.rows[0];
    if (!row) return next(AppError.unauthorized('User no longer exists'));
    if (row.status === 'banned') {
      return next(AppError.forbidden('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.'));
    }
    if (row.status !== 'restricted') return next();

    const path = (req.originalUrl || req.url || '').split('?')[0] ?? '';
    const method = (req.method || 'GET').toUpperCase();
    const allowed = RESTRICTED_ALLOWLIST.some((a) => a.method === method && a.test(path));
    if (allowed) return next();

    return next(
      AppError.forbidden(
        row.ban_reason
          ? `Tài khoản của bạn đang bị hạn chế: ${row.ban_reason}. Vui lòng liên hệ quản trị viên để được gỡ hạn chế.`
          : 'Tài khoản của bạn đang bị hạn chế thao tác. Vui lòng liên hệ quản trị viên để được gỡ hạn chế.',
      ),
    );
  } catch (e) {
    return next(e);
  }
}
