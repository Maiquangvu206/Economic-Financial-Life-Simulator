import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { AppError } from './errors.js';

// Endpoints allowed for banned/restricted (player) accounts so they can see overlay/notice/contact info.
// Write actions (POST/PUT/PATCH/DELETE...) remain blocked.
const ACCOUNT_BLOCK_ALLOWLIST: Array<{ method: string; test: (path: string) => boolean }> = [
  { method: 'GET', test: (p) => p === '/api/v1/game-config' },
  { method: 'GET', test: (p) => p === '/api/v1/broadcasts/active' },
  { method: 'GET', test: (p) => p === '/api/v1/broadcasts/login' },
  { method: 'GET', test: (p) => p.startsWith('/api/v1/notifications') },
  { method: 'GET', test: (p) => p === '/api/v1/characters/me' || p.startsWith('/api/v1/characters/me/') },
  { method: 'GET', test: (p) => p === '/api/v1/auth/me' },
  { method: 'GET', test: (p) => p === '/api/v1/player/bootstrap' },
  { method: 'GET', test: (p) => p.startsWith('/api/v1/offline/settings') },
];

// During system maintenance, allow players to read minimal info needed to show notice/login context.
const MAINTENANCE_ALLOWLIST: Array<{ method: string; test: (path: string) => boolean }> = [
  { method: 'GET', test: (p) => p === '/api/v1/game-config' },
  { method: 'GET', test: (p) => p === '/api/v1/broadcasts/login' },
  { method: 'GET', test: (p) => p === '/api/v1/broadcasts/active' },
  { method: 'GET', test: (p) => p.startsWith('/api/v1/notifications') },
];

let maintenanceCache: { enabled: boolean; at: number } = { enabled: false, at: 0 };
const MAINTENANCE_CACHE_MS = 3000;

async function isMaintenanceEnabled(): Promise<boolean> {
  const now = Date.now();
  if (now - maintenanceCache.at < MAINTENANCE_CACHE_MS) return maintenanceCache.enabled;
  try {
    const r = await pool.query<{ macro: any }>(`SELECT macro FROM game_state WHERE id = 1`);
    const macro = r.rows[0]?.macro && typeof r.rows[0].macro === 'object' ? r.rows[0].macro : {};
    const enabled = !!(macro as any)?.maintenance?.enabled;
    maintenanceCache = { enabled, at: now };
    return enabled;
  } catch {
    // Fail open to avoid accidental lockout if DB read fails transiently.
    maintenanceCache = { enabled: false, at: now };
    return false;
  }
}

export async function enforceNotRestricted(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const actorId = req.actorId;
    if (!actorId) return next();

    const path = (req.originalUrl || req.url || '').split('?')[0] ?? '';
    const method = (req.method || 'GET').toUpperCase();

    // System maintenance: pause player access/actions (admins/moderators can still operate).
    if (req.actorRole === 'player') {
      const maintenanceEnabled = await isMaintenanceEnabled();
      if (maintenanceEnabled) {
        const allowed = MAINTENANCE_ALLOWLIST.some((a) => a.method === method && a.test(path));
        if (!allowed) {
          return next(AppError.forbidden('Hệ thống đang tạm dừng để bảo trì hoặc nâng cấp. Vui lòng quay lại sau.'));
        }
        // During maintenance, allow only notice-related reads for players.
        return next();
      }
    } else {
      return next();
    }

    const r = await pool.query<{ status: string; ban_reason: string | null }>(
      `SELECT status, ban_reason FROM users WHERE id = $1 LIMIT 1`,
      [actorId],
    );
    const row = r.rows[0];
    if (!row) return next(AppError.unauthorized('User no longer exists'));
    if (row.status !== 'restricted' && row.status !== 'banned') return next();

    const allowed = ACCOUNT_BLOCK_ALLOWLIST.some((a) => a.method === method && a.test(path));
    if (allowed) return next();

    if (row.status === 'banned') {
      return next(
        AppError.forbidden(
          row.ban_reason
            ? `Tài khoản đã bị khóa: ${row.ban_reason}. Vui lòng liên hệ quản trị viên.`
            : 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
        ),
      );
    }

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
