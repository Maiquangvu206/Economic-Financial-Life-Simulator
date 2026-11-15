import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../../shared/db/pool.js';
import { AppError } from '../../shared/http/errors.js';
import { listActionLogs, writeActionLog } from '../../shared/audit/actionLog.js';
import { notify } from '../notifications/notification.service.js';
import { publishToUser, publishToAllUsers } from '../../shared/realtime/publish.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { underworldService } from '../underworld/underworld.service.js';
import type { MacroSnapshotDto, TriggerMacroEventRequest, CreateAdminAccountRequest, SetUserRoleRequest, AdminTriggerSweepRequest } from '@efls/contracts';

function ensureAdmin(req: Request): void {
  if (req.actorRole !== 'admin' && req.actorRole !== 'moderator') {
    throw AppError.forbidden('Admin role required');
  }
}

function ensureSuperAdmin(req: Request): void {
  if (req.actorRole !== 'admin') {
    throw AppError.forbidden('Chỉ quản trị viên (admin) mới được thực hiện thao tác này.');
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
  if (!action || !['fine', 'ban', 'grant_aid', 'unban', 'restrict', 'force_delete'].includes(action)) {
    throw AppError.badRequest('Hành động không hợp lệ.');
  }

  const c = await pool.query(
    `SELECT c.id, c.user_id, c.full_name, u.email, u.username, u.role AS user_role
     FROM characters c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [characterId],
  );
  const ch = c.rows[0] as
    | { id: string; user_id: string | null; full_name: string; email: string | null; username: string | null; user_role: string | null }
    | undefined;
  if (!ch) throw AppError.notFound('Nhân vật');

  if (action === 'force_delete') {
    ensureSuperAdmin(req);
    const note = (body?.note ?? '').trim();
    if (!note) {
      throw AppError.badRequest('Vui lòng cung cấp lý do/ghi chú khi cưỡng chế xóa tài khoản.');
    }
    if (ch.user_id && ch.user_id === req.actorId) {
      throw AppError.badRequest('Bạn không thể cưỡng chế xóa tài khoản của chính mình.');
    }
    if (!ch.user_id) {
      throw AppError.badRequest('Không thể xóa: nhân vật không gắn với tài khoản người dùng.');
    }

    await writeActionLog(pool as any, req.actorId, 'player.force_delete', {
      characterId,
      characterName: ch.full_name,
      targetUserId: ch.user_id,
      email: ch.email ?? null,
      username: ch.username ?? null,
      targetRole: ch.user_role ?? null,
      note,
    });

    try {
      await notify(pool as any, {
        userId: ch.user_id,
        kind: 'admin_action',
        title: 'Tài khoản bị cưỡng chế xử lý',
        body: 'Tài khoản của bạn đã bị quản trị viên cưỡng chế xóa do phát hiện bất thường. Phiên đăng nhập sẽ bị chấm dứt.',
        payload: { action: 'force_delete', characterId, note },
      });
      await publishToUser(ch.user_id, 'notification', {
        kind: 'admin_action',
        title: 'Tài khoản bị cưỡng chế xử lý',
        body: 'Tài khoản của bạn đã bị cưỡng chế xóa bởi quản trị viên.',
        at: Date.now(),
      });
    } catch {
      /* ignore */
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Gỡ tham chiếu chặn xóa (NO ACTION) nhưng giữ lịch sử giao dịch
      await client.query(
        `UPDATE stock_trades SET buyer_character_id = NULL WHERE buyer_character_id = $1`,
        [characterId],
      );
      await client.query(
        `UPDATE stock_trades SET seller_character_id = NULL WHERE seller_character_id = $1`,
        [characterId],
      );
      // Xóa tài khoản người dùng (cascade: characters và các dữ liệu liên kết theo ràng buộc FK)
      const del = await client.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [ch.user_id]);
      if (!del.rows[0]) {
        throw AppError.notFound('Tài khoản người dùng');
      }
      await client.query('COMMIT');
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e?.code === '23503') {
        throw AppError.conflict(
          'account_delete_blocked',
          'Không thể xóa cưỡng chế do còn dữ liệu/ràng buộc liên kết chưa thể gỡ tự động. Vui lòng khóa (ban) tài khoản hoặc xử lý thủ công dữ liệu liên quan.',
        );
      }
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true, action, characterId, userId: ch.user_id, deleted: true });
    return;
  }

  if (action === 'fine' || action === 'grant_aid') {
    const amountMinor = Number(body?.amount?.amount ?? 0);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) throw AppError.badRequest('Số tiền không hợp lệ.');
    const delta = action === 'fine' ? -amountMinor : amountMinor;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query<{ cash_minor: string }>(
        `SELECT cash_minor FROM characters WHERE id = $1 FOR UPDATE`,
        [characterId],
      );
      if (!cur.rows[0]) throw AppError.notFound('Nhân vật');
      const before = Number(cur.rows[0].cash_minor ?? 0);
      const after = Math.max(0, before + delta);
      const actualDelta = after - before;

      await client.query(
        `INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, balance_minor, is_system)
         VALUES (gen_random_uuid(), 'character', $1, 'cash', $2, false)
         ON CONFLICT (owner_type, owner_id, kind, currency) DO NOTHING`,
        [characterId, before],
      );
      await client.query(
        `UPDATE characters SET cash_minor = $2, updated_at = now() WHERE id = $1`,
        [characterId, after],
      );
      await client.query(
        `UPDATE ledger_accounts SET balance_minor = $2, updated_at = now()
         WHERE owner_type='character' AND owner_id=$1 AND kind='cash' AND currency='VND'`,
        [characterId, after],
      );
      await client.query('COMMIT');

      body.amount = body.amount ? { amount: Math.abs(actualDelta) } : body.amount;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  if (ch.user_id && (action === 'ban' || action === 'unban' || action === 'restrict')) {
    if (action === 'ban') {
      await pool.query(
        `UPDATE users SET status = 'banned', ban_reason = $2, banned_until = NULL, status_updated_at = now(), updated_at = now() WHERE id = $1`,
        [ch.user_id, body?.note ?? 'Bị khóa bởi quản trị viên'],
      );
    } else if (action === 'restrict') {
      await pool.query(
        `UPDATE users SET status = 'restricted', ban_reason = $2, banned_until = NULL, status_updated_at = now(), updated_at = now() WHERE id = $1`,
        [ch.user_id, body?.note ?? 'Tài khoản bị hạn chế thao tác do phát hiện bất thường.'],
      );
    } else {
      // unban: gỡ khóa/gỡ hạn chế -> active
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
      const notifBody =
        action === 'fine'
          ? `Tài khoản của bạn đã bị phạt ${Number(body?.amount?.amount ?? 0).toLocaleString('vi-VN')} ₫.`
          : action === 'grant_aid'
            ? `Bạn đã nhận hỗ trợ ${Number(body?.amount?.amount ?? 0).toLocaleString('vi-VN')} ₫ từ quản trị.`
            : action === 'ban'
              ? 'Tài khoản của bạn đã bị khóa. Bạn sẽ không thể đăng nhập cho tới khi được gỡ khóa.'
              : action === 'restrict'
                ? 'Tài khoản của bạn đã bị hạn chế thao tác. Các chức năng game sẽ bị khóa cho đến khi quản trị viên gỡ hạn chế. Vui lòng xem thông tin liên hệ hỗ trợ trong ứng dụng.'
                : 'Tài khoản của bạn đã được gỡ khóa/gỡ hạn chế bởi quản trị.';
      await notify(pool as any, {
        userId: ch.user_id,
        kind: 'admin_action',
        title: 'Thông báo từ quản trị hệ thống',
        body: notifBody,
        payload: { action, characterId, note: body?.note ?? null },
      });
      await publishToUser(ch.user_id, 'notification', {
        kind: 'admin_action',
        title: 'Thông báo từ quản trị hệ thống',
        body:
          action === 'ban'
            ? 'Tài khoản của bạn đã bị khóa. Vui lòng đăng xuất.'
            : action === 'restrict'
              ? 'Tài khoản của bạn đã bị hạn chế thao tác. Vui lòng liên hệ admin để gỡ.'
              : action === 'unban'
                ? 'Tài khoản của bạn đã được gỡ khóa/gỡ hạn chế.'
                : 'Bạn có thông báo mới từ quản trị.',
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
    restrictionContact: normalizeRestrictionContact((macro as any).restrictionContact),
    macro,
  });
}

export async function updateGameConfig(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as {
    season?: string;
    currentDay?: number;
    currentYear?: number;
    otRatePercent?: number;
    macro?: Record<string, unknown>;
    restrictionContact?: Record<string, unknown>;
  };
  const existing = await pool.query(`SELECT macro FROM game_state WHERE id = 1`);
  const prevMacro = (existing.rows[0]?.macro && typeof existing.rows[0].macro === 'object') ? (existing.rows[0].macro as any) : {};
  const nextMacro: Record<string, unknown> = {
    ...prevMacro,
    ...(body.macro ?? {}),
  };
  if (body.otRatePercent != null) {
    nextMacro.otRatePercent = Math.max(100, Math.min(500, Math.round(Number(body.otRatePercent))));
  }
  if (body.restrictionContact != null) {
    nextMacro.restrictionContact = {
      ...normalizeRestrictionContact(prevMacro.restrictionContact),
      ...body.restrictionContact,
      updatedAt: new Date().toISOString(),
    };
  }
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
    restrictionContact: body.restrictionContact ? true : null,
  });
  await publishToAllUsers('notification', { kind: 'info', title: 'Cấu hình hệ thống đã cập nhật', body: 'Cấu hình hệ thống/liên hệ hỗ trợ đã được cập nhật bởi quản trị.', at: Date.now() });
  await getGameConfig(req, res);
}

function normalizeRestrictionContact(raw: any) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: d.enabled !== false,
    title: String(d.title ?? 'Tài khoản đang bị hạn chế').slice(0, 200),
    message: String(d.message ?? 'Tài khoản của bạn đang bị hạn chế thao tác. Vui lòng liên hệ quản trị viên để được hỗ trợ gỡ hạn chế.').slice(0, 2000),
    email: String(d.email ?? '').slice(0, 200),
    phone: String(d.phone ?? '').slice(0, 100),
    zalo: String(d.zalo ?? '').slice(0, 200),
    discord: String(d.discord ?? '').slice(0, 200),
    other: String(d.other ?? '').slice(0, 500),
  };
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
    restrictionContact: normalizeRestrictionContact((macro as any).restrictionContact),
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

const authRepo = new AuthRepository();

export async function adminCreateAccount(req: Request, res: Response): Promise<void> {
  ensureSuperAdmin(req);
  const body = req.body as CreateAdminAccountRequest;
  const email = body.email.trim().toLowerCase();
  const username = body.username.trim();
  const fullName = body.fullName.trim();
  const role = body.role;
  if (!['admin', 'moderator'].includes(role)) {
    throw AppError.badRequest('Vai trò không hợp lệ.');
  }
  if (await authRepo.emailExists(email)) {
    throw AppError.conflict('email_taken', 'Email đã được sử dụng.');
  }
  const existingUsername = await pool.query(`SELECT 1 FROM users WHERE lower(username)=lower($1) LIMIT 1`, [username]);
  if (existingUsername.rows[0]) {
    throw AppError.conflict('username_taken', 'Username đã được sử dụng.');
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const { user, characterId } = await authRepo.createWithCharacter({
    email,
    username,
    passwordHash,
    fullName: fullName || username,
    birthplaceCode: '001',
    role,
  });

  await writeActionLog(pool as any, req.actorId, 'admin.account.create', {
    targetUserId: user.id,
    targetCharacterId: characterId,
    email: user.email,
    username: user.username,
    role: user.role,
  });

  res.status(201).json({
    ok: true,
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
    characterId,
  });
}

export async function adminSetUserRole(req: Request, res: Response): Promise<void> {
  ensureSuperAdmin(req);
  const body = req.body as SetUserRoleRequest;
  const { userId, role } = body;
  const note = body.note?.trim() || null;

  if (userId === req.actorId && role !== 'admin') {
    throw AppError.badRequest('Bạn không thể tự hạ quyền tài khoản admin đang đăng nhập.');
  }

  const existing = await pool.query<{ id: string; email: string; username: string; role: string }>(
    `SELECT id, email, username, role FROM users WHERE id = $1`,
    [userId],
  );
  const target = existing.rows[0];
  if (!target) throw AppError.notFound('Tài khoản');

  if (target.role === role) {
    res.json({ ok: true, userId, role, changed: false });
  return;
  }

  await pool.query(`UPDATE users SET role = $2, updated_at = now() WHERE id = $1`, [userId, role]);

  await writeActionLog(pool as any, req.actorId, 'admin.account.set_role', {
    targetUserId: userId,
    email: target.email,
    username: target.username,
    fromRole: target.role,
    toRole: role,
    note,
  });

  const roleLabel = role === 'admin' ? 'Quản trị viên (admin)' : role === 'moderator' ? 'Điều hành viên (moderator)' : 'Người chơi';
  try {
    await notify(pool as any, {
      userId,
      kind: 'admin_action',
      title: 'Quyền tài khoản đã được cập nhật',
      body: `Quyền truy cập của bạn đã được thay đổi thành: ${roleLabel}. Vui lòng đăng xuất và đăng nhập lại để áp dụng quyền mới.`,
      payload: { action: 'set_role', fromRole: target.role, toRole: role, note },
    });
    await publishToUser(userId, 'notification', {
      kind: 'admin_action',
      title: 'Quyền tài khoản đã được cập nhật',
      body: `Quyền của bạn đã đổi thành ${roleLabel}. Hãy đăng nhập lại để áp dụng.`,
      at: Date.now(),
    });
  } catch {
    /* ignore */
  }

  res.json({ ok: true, userId, role, fromRole: target.role, changed: true });
}

export async function adminTriggerSweep(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as AdminTriggerSweepRequest;
  const note = body.note?.trim() || null;
  const isAll = body.scope === 'all' || (!body.characterId && !body.cccd);

  if (isAll) {
    const result = await underworldService.adminSweepAll();
    await writeActionLog(pool as any, req.actorId, 'admin.sweep.trigger', {
      scope: 'all',
      affected: result.affected,
      totalFineMinor: result.totalFineMinor,
      note,
    });
    try {
      const title = 'Đại án Công an (toàn hệ thống)';
      const content = `Quản trị viên đã kích hoạt Đại án toàn hệ thống: áp dụng cho ${result.affected} nhân vật. Tổng tiền phạt thu: ${result.totalFineMinor.toLocaleString('vi-VN')} ₫.`;
      await pool.query(
        `INSERT INTO notifications (id, user_id, kind, title, body, payload)
         SELECT gen_random_uuid(), u.id, 'underworld', $1, $2, $3::jsonb FROM users u`,
        [title, content.slice(0, 500), JSON.stringify({ scope: 'all', affected: result.affected })],
      );
      await publishToAllUsers('notification', { kind: 'underworld', title, body: content.slice(0, 200), at: Date.now() });
    } catch {
      /* ignore */
    }
    res.json({ ok: true, scope: 'all', affected: result.affected, totalFineMinor: result.totalFineMinor });
    return;
  }

  const targetId = body.characterId?.trim();
  const targetCccd = body.cccd?.trim();
  const r = await underworldService.adminSweepCharacter({ characterId: targetId || undefined, cccd: targetCccd || undefined });
  await writeActionLog(pool as any, req.actorId, 'admin.sweep.trigger', {
    scope: 'character',
    characterId: r.characterId,
    triggerHeat: r.triggerHeat,
    fineMinor: r.fineMinor,
    prisonDays: r.prisonDays,
    note,
  });
  res.json({ ok: true, scope: 'character', ...r });
}

export async function adminAiEvaluateSweeps(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const result = await underworldService.evaluateSweepsWithAI({ actorId: req.actorId ?? null, trigger: 'manual_ai' });
  res.json({ ok: true, ...result });
}
