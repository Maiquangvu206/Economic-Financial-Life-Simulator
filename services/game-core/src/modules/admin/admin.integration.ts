import type { Request, Response } from 'express';
import { pool } from '../../shared/db/pool.js';
import { AppError } from '../../shared/http/errors.js';
import { listActionLogs, writeActionLog } from '../../shared/audit/actionLog.js';
import { notify } from '../notifications/notification.service.js';
import { publishToUser, publishToAllUsers } from '../../shared/realtime/publish.js';
import type { MacroSnapshotDto, TriggerMacroEventRequest } from '@efls/contracts';

function ensureAdmin(req: Request): void {
  if (req.actorRole !== 'admin' && req.actorRole !== 'moderator') {
    throw AppError.forbidden('Admin role required');
  }
}

function money(amount: number) {
  return { amount, currency: 'VND' as const };
}

export async function getMacroSnapshot(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const client = await pool.connect();
  try {
    const [stateRes, moneyRes, marketRes, ccuRes, casesRes] = await Promise.all([
      client.query(`SELECT current_day, current_year, season, macro FROM game_state WHERE id = 1`),
      client.query(
        `SELECT COALESCE(SUM(balance_minor), 0)::bigint AS total
         FROM ledger_accounts
         WHERE currency = 'VND' AND (owner_type IN ('character','company','escrow','clearing') OR (owner_type = 'government' AND balance_minor > 0))`,
      ),
      client.query(`
        SELECT COALESCE(SUM(c.valuation_minor), 0)::bigint AS total
        FROM companies c
        WHERE c.status = 'ipo' OR c.ticker_symbol IS NOT NULL
      `),
      client.query(`SELECT COUNT(*)::int AS total FROM characters WHERE user_id IS NOT NULL AND is_alive = true`),
      client.query(
        `SELECT COUNT(*)::int AS total
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'court_cases'`,
      ),
    ]);
    let activeCourtCases = 0;
    if ((casesRes.rows[0]?.total ?? 0) > 0) {
      try {
        const c = await client.query(
          `SELECT COUNT(*)::int AS total FROM court_cases WHERE status IN ('open','in_progress','trial')`,
        );
        activeCourtCases = Number(c.rows[0]?.total ?? 0);
      } catch {
        activeCourtCases = 0;
      }
    }

    const state = stateRes.rows[0] ?? { current_day: 0, current_year: 1, season: 'spring', macro: {} };
    const macro = (state.macro && typeof state.macro === 'object') ? state.macro : {};
    const snapshot: MacroSnapshotDto = {
      tick: Number(state.current_day ?? 0),
      inGameYear: Number(state.current_year ?? 1),
      moneySupply: money(Number(moneyRes.rows[0]?.total ?? 0)),
      inflationPct: Number((macro as any).inflationPct ?? 0),
      cpi: Number((macro as any).cpi ?? 100),
      marketCap: money(Number(marketRes.rows[0]?.total ?? 0)),
      concurrentUsers: Number(ccuRes.rows[0]?.total ?? 0),
      activeCourtCases,
      generatedAt: new Date().toISOString(),
    };
    res.json(snapshot);
  } finally {
    client.release();
  }
}

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const limit = req.query.limit != null ? Number(req.query.limit) : 100;
  const offset = req.query.offset != null ? Number(req.query.offset) : 0;
  const rows = await listActionLogs(limit, offset);
  res.json(
    rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      action: r.action,
      detail: r.detail ?? {},
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  );
}

export async function searchPlayers(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const q = String(req.query.q ?? req.query.query ?? '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
  const params: any[] = [limit];
  let where = '1=1';
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where = `(c.full_name ILIKE ${p} OR c.cccd ILIKE ${p} OR c.id::text ILIKE ${p} OR u.email ILIKE ${p} OR u.username ILIKE ${p})`;
  }
  const r = await pool.query(
    `SELECT c.id, c.user_id AS "userId", c.full_name AS "fullName", c.cccd, c.is_alive AS "isAlive",
            c.cash_minor AS "cashMinor", c.credit_score AS "creditScore", c.heat_level AS "heatLevel", c.age,
            u.role, u.email, u.username, u.status AS "accountStatus"
     FROM characters c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT $1`,
    params,
  );
  res.json(
    r.rows.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      fullName: row.fullName,
      cccd: row.cccd ?? null,
      isAlive: !!row.isAlive,
      cash: money(Number(row.cashMinor ?? 0)),
      creditScore: Number(row.creditScore ?? 0),
      heatLevel: Number(row.heatLevel ?? 0),
      age: Number(row.age ?? 0),
      role: row.role ?? null,
      email: row.email ?? null,
      username: row.username ?? null,
      accountStatus: row.accountStatus ?? null,
    })),
  );
}

export async function adminPlayerAction(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const characterId = req.params.id as string;
  const body = req.body as { action?: string; amount?: { amount: number }; note?: string };
  const action = body?.action;
  if (!action || !['fine', 'ban', 'grant_aid', 'unban'].includes(action)) {
    throw AppError.badRequest('Hành động không hợp lệ.');
  }
  const c = await pool.query(`SELECT id, user_id, full_name FROM characters WHERE id = $1`, [characterId]);
  const ch = c.rows[0];
  if (!ch) throw AppError.notFound('Nhân vật');

  if (action === 'fine' || action === 'grant_aid') {
    const amountMinor = Number(body?.amount?.amount ?? 0);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) throw AppError.badRequest('Số tiền không hợp lệ.');
    const delta = action === 'fine' ? -amountMinor : amountMinor;
    await pool.query(
      `UPDATE characters SET cash_minor = GREATEST(0, cash_minor + $2), updated_at = now() WHERE id = $1`,
      [characterId, delta],
    );
    await pool.query(
      `UPDATE ledger_accounts SET balance_minor = balance_minor + $2, updated_at = now()
       WHERE owner_type='character' AND owner_id=$1 AND kind='cash' AND currency='VND'`,
      [characterId, delta],
    );
  }

  if (ch.user_id && (action === 'ban' || action === 'unban')) {
    if (action === 'ban') {
      await pool.query(
        `UPDATE users SET status = 'banned', ban_reason = $2, banned_until = NULL, status_updated_at = now(), updated_at = now() WHERE id = $1`,
        [ch.user_id, body?.note ?? 'Bị khóa bởi quản trị viên'],
      );
    } else {
      await pool.query(
        `UPDATE users SET status = 'active', ban_reason = NULL, banned_until = NULL, status_updated_at = now(), updated_at = now() WHERE id = $1`,
        [ch.user_id],
      );
    }
  }

  await writeActionLog(pool as any, req.actorId, `player.${action}`, {
    characterId,
    characterName: ch.full_name,
    amountMinor: body?.amount?.amount ?? null,
    note: body?.note ?? null,
  });

  if (ch.user_id) {
    try {
      await notify(pool as any, {
        userId: ch.user_id,
        kind: 'admin_action',
        title: 'Thông báo từ quản trị hệ thống',
        body:
          action === 'fine'
            ? `Tài khoản của bạn đã bị phạt ${Number(body?.amount?.amount ?? 0).toLocaleString('vi-VN')} ₫.`
            : action === 'grant_aid'
              ? `Bạn đã nhận hỗ trợ ${Number(body?.amount?.amount ?? 0).toLocaleString('vi-VN')} ₫ từ quản trị.`
              : action === 'ban'
                ? 'Tài khoản của bạn đã bị khóa theo quyết định quản trị. Bạn sẽ không thể đăng nhập/tiếp tục phiên cho tới khi được gỡ khóa.'
                : 'Tài khoản của bạn đã được gỡ khóa bởi quản trị.',
        payload: { action, characterId, note: body?.note ?? null },
      });
      await publishToUser(ch.user_id, 'notification', {
        kind: 'admin_action',
        title: 'Thông báo từ quản trị hệ thống',
        body: action === 'ban' ? 'Tài khoản của bạn đã bị khóa. Vui lòng đăng xuất.' : action === 'unban' ? 'Tài khoản của bạn đã được gỡ khóa.' : 'Bạn có thông báo mới từ quản trị.',
        at: Date.now(),
      });
    } catch {
      /* ignore */
    }
  }

  res.json({ ok: true, action, characterId });
}

export async function getGameConfig(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const r = await pool.query(`SELECT current_day, current_year, season, macro FROM game_state WHERE id = 1`);
  const row = r.rows[0] ?? { current_day: 0, current_year: 1, season: 'spring', macro: {} };
  const macro = (row.macro && typeof row.macro === 'object') ? row.macro : {};
  res.json({
    currentDay: Number(row.current_day ?? 0),
    currentYear: Number(row.current_year ?? 1),
    season: row.season ?? 'spring',
    otRatePercent: Number((macro as any).otRatePercent ?? 300),
    macro,
  });
}

export async function updateGameConfig(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as { season?: string; currentDay?: number; currentYear?: number; otRatePercent?: number; macro?: Record<string, unknown> };
  const existing = await pool.query(`SELECT macro FROM game_state WHERE id = 1`);
  const prevMacro = (existing.rows[0]?.macro && typeof existing.rows[0].macro === 'object') ? existing.rows[0].macro : {};
  const nextMacro = {
    ...prevMacro,
    ...(body.macro ?? {}),
    ...(body.otRatePercent != null ? { otRatePercent: Math.max(100, Math.min(500, Math.round(Number(body.otRatePercent)))) } : {}),
  };
  await pool.query(
    `INSERT INTO game_state (id, current_day, current_year, season, macro)
     VALUES (1, COALESCE($1,0), COALESCE($2,1), COALESCE($3,'spring'), $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       current_day = COALESCE($1, game_state.current_day),
       current_year = COALESCE($2, game_state.current_year),
       season = COALESCE($3, game_state.season),
       macro = $4::jsonb,
       updated_at = now()`,
    [body.currentDay ?? null, body.currentYear ?? null, body.season ?? null, JSON.stringify(nextMacro)],
  );
  await writeActionLog(pool as any, req.actorId, 'game.config.update', {
    season: body.season ?? null,
    currentDay: body.currentDay ?? null,
    currentYear: body.currentYear ?? null,
    otRatePercent: (nextMacro as any).otRatePercent ?? null,
  });
  await publishToAllUsers('notification', { kind: 'info', title: 'Cấu hình hệ thống đã cập nhật', body: 'Mùa hoặc cấu hình game đã được thay đổi bởi quản trị.', at: Date.now() });
  await getGameConfig(req, res);
}

export async function getGameConfigPublic(_req: Request, res: Response): Promise<void> {
  const r = await pool.query(`SELECT current_day, current_year, season, macro FROM game_state WHERE id = 1`);
  const row = r.rows[0] ?? { current_day: 0, current_year: 1, season: 'spring', macro: {} };
  const macro = (row.macro && typeof row.macro === 'object') ? row.macro : {};
  res.json({
    currentDay: Number(row.current_day ?? 0),
    currentYear: Number(row.current_year ?? 1),
    season: row.season ?? 'spring',
    otRatePercent: Number((macro as any).otRatePercent ?? 300),
  });
}

export async function triggerMacroEvent(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as TriggerMacroEventRequest;
  const existing = await pool.query(`SELECT macro FROM game_state WHERE id = 1`);
  const prevMacro = (existing.rows[0]?.macro && typeof existing.rows[0].macro === 'object') ? existing.rows[0].macro : {};
  const activeEvents = Array.isArray((prevMacro as any).activeEvents) ? (prevMacro as any).activeEvents : [];
  const eventRecord = {
    id: crypto.randomUUID(),
    type: body.type,
    severity: body.severity,
    durationInGameYears: body.durationInGameYears,
    reason: body.reason,
    startedAt: new Date().toISOString(),
  };
  const nextMacro = { ...prevMacro, activeEvents: [eventRecord, ...activeEvents].slice(0, 20) };
  await pool.query(
    `INSERT INTO game_state (id, current_day, current_year, season, macro)
     VALUES (1, 0, 1, 'spring', $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET macro = $1::jsonb, updated_at = now()`,
    [JSON.stringify(nextMacro)],
  );
  await writeActionLog(pool as any, req.actorId, 'macro.event.trigger', {
    type: body.type, severity: body.severity, durationInGameYears: body.durationInGameYears, reason: body.reason,
  });
  // Thông báo hệ thống cho người dùng (lưu + realtime best-effort)
  try {
    const title = `Sự kiện vĩ mô: ${body.type}`;
    const content = `Hệ thống kích hoạt sự kiện ${body.type} (mức độ ${Math.round(body.severity * 100)}%, ${body.durationInGameYears} năm). ${body.reason}`;
    await pool.query(
      `INSERT INTO system_broadcasts (id, title, content, type, scope, pinned, sender, sender_actor_id)
       VALUES (gen_random_uuid(), $1, $2, 'economy', 'all', true, 'Hệ thống vĩ mô', $3)`,
      [title, content, req.actorId ?? null],
    );
    await pool.query(
      `INSERT INTO notifications (id, user_id, kind, title, body, payload)
       SELECT gen_random_uuid(), u.id, 'macro_event', $1, $2, $3::jsonb FROM users u`,
      [title, content.slice(0, 500), JSON.stringify({ type: body.type, severity: body.severity })],
    );
    await publishToAllUsers('notification', { kind: 'macro_event', title, body: content.slice(0, 200), at: Date.now() });
  } catch { /* ignore */ }
  res.json({ ok: true, event: eventRecord });
}
