import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { DEFAULT_SEASON_EFFECTS, DEFAULT_SEASON_RANGES, deriveCanonicalGameTime, GAME_START_YEAR, getSeasonByMonthWithRanges, normalizeSeasonEffects, normalizeSeasonRanges } from '@efls/domain';
import { pool } from '../../shared/db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import { listActionLogs, writeActionLog } from '../../shared/audit/actionLog.js';
import { notify } from '../notifications/notification.service.js';
import { publishToUser, publishToAllUsers } from '../../shared/realtime/publish.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { underworldService } from '../underworld/underworld.service.js';
import { adjustStateFund, creditStateFund, debitStateFund, getStateFundBalance } from '../../shared/state-fund/stateFund.js';
import { supportCompaniesFromStateFund } from '../../shared/state-fund/supportCompanies.js';
import type { MacroSnapshotDto, TriggerMacroEventRequest, CreateAdminAccountRequest, SetUserRoleRequest, AdminTriggerSweepRequest, UpdateInterestRateConfigRequest, InterestRateConfigDto, AdjustStateFundRequest, SupportCompaniesFromStateFundRequest } from '@efls/contracts';

function gameTimePayload(row: { current_day: any; current_year: any; season: any; updated_at?: any; macro?: any }) {
  const dayOfYear = Number(row.current_day ?? 0);
  const year = Number(row.current_year ?? GAME_START_YEAR);
  const macro = row.macro && typeof row.macro === 'object' ? (row.macro as any) : {};
  const seasonRanges = normalizeSeasonRanges(macro.seasonRanges) ?? DEFAULT_SEASON_RANGES;
  const t = deriveCanonicalGameTime({ dayOfYear, year, tickUpdatedAt: row.updated_at ?? null, seasonRanges });
  // Mùa hiệu lực = mùa theo cấu hình khoảng thời gian mùa (tháng game). Không dùng cột game_state.season.
  return {
    currentDay: dayOfYear,
    dayOfYear,
    currentYear: t.year,
    currentMonth: t.month,
    currentDayOfMonth: t.day,
    hour: t.hour,
    minute: t.minute,
    season: t.season,
    seasonRanges,
    seasonEffects: normalizeSeasonEffects(macro.seasonEffects) ?? DEFAULT_SEASON_EFFECTS,
    period: t.period,
    tickUpdatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

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
        `SELECT (
            COALESCE((
              SELECT SUM(la.balance_minor)::bigint
              FROM ledger_accounts la
              JOIN characters c ON c.id = la.owner_id AND la.owner_type = 'character'
              JOIN users u ON u.id = c.user_id
              WHERE u.role = 'player' AND la.currency = 'VND'
            ), 0)
          + COALESCE((
              SELECT SUM(la.balance_minor)::bigint
              FROM ledger_accounts la
              JOIN companies co ON co.id = la.owner_id AND la.owner_type = 'company'
              JOIN characters c ON c.id = co.owner_character_id
              JOIN users u ON u.id = c.user_id
              WHERE u.role = 'player' AND la.currency = 'VND'
            ), 0)
          )::bigint AS total`,
      ),
      client.query(`
        SELECT COALESCE(SUM(effective_company_valuation(c.id)), 0)::bigint AS total FROM companies c WHERE c.status = 'ipo' OR c.ticker_symbol IS NOT NULL
      `),
      client.query(
        `SELECT COUNT(*)::int AS total
         FROM characters c
         JOIN users u ON u.id = c.user_id
         WHERE u.role = 'player' AND COALESCE(c.is_alive, true) = true`,
      ),
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

    const state = stateRes.rows[0] ?? { current_day: 0, current_year: GAME_START_YEAR, season: 'spring', macro: {} };
    const macro = (state.macro && typeof state.macro === 'object') ? state.macro : {};
    let stateFundBalanceMinor = 0;
    try { stateFundBalanceMinor = await getStateFundBalance(client as any); } catch { stateFundBalanceMinor = 0; }
    const snapshot: MacroSnapshotDto = {
      tick: Number(state.current_day ?? 0),
      inGameYear: Number(state.current_year ?? GAME_START_YEAR),
      moneySupply: money(Number(moneyRes.rows[0]?.total ?? 0)),
      inflationPct: Number((macro as any).inflationPct ?? 0),
      cpi: Number((macro as any).cpi ?? 100),
      marketCap: money(Number(marketRes.rows[0]?.total ?? 0)),
      concurrentUsers: Number(ccuRes.rows[0]?.total ?? 0),
      activeCourtCases,
      stateFundBalance: money(stateFundBalanceMinor),
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
    rows.map((r) => {
      const actorDisplayName = r.actorId == null
        ? 'Hệ thống tự động'
        : (r.actorCharacterName || r.actorUsername || (r.actorEmail ? r.actorEmail.split('@')[0] : null) || 'Quản trị viên');
      const actorRoleLabel = r.actorRole === 'admin' ? 'Quản trị viên'
        : r.actorRole === 'moderator' ? 'Điều hành viên'
        : r.actorRole === 'player' ? 'Người chơi'
        : (r.actorId == null ? '' : 'Quản trị viên');
      return {
        id: r.id,
        actorId: r.actorId,
        actorDisplayName,
        actorRoleLabel,
        action: r.action,
        detail: r.detail ?? {},
        createdAt: new Date(r.createdAt).toISOString(),
      };
    }),
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
    `SELECT c.id, c.user_id AS "userId", c.full_name AS "fullName", c.cccd, COALESCE(c.is_alive, true) AS "isAlive",
            c.cash_minor AS "cashMinor", c.credit_score AS "creditScore", c.heat_level AS "heatLevel", c.age,
            c.death_age AS "deathAge",
            u.role, u.email, u.username, u.status AS "accountStatus"
     FROM characters c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE ${where}
     ORDER BY COALESCE(c.is_alive, true) DESC, c.created_at DESC
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
      deathAge: row.deathAge == null ? null : Number(row.deathAge),
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
  const body = req.body as { action?: string; amount?: { amount: number }; deathAge?: number | null; note?: string };
  const action = body?.action;
  if (!action || !['fine', 'ban', 'grant_aid', 'unban', 'restrict', 'force_delete', 'set_death_age'].includes(action)) {
    throw AppError.badRequest('Hành động không hợp lệ.');
  }

  const c = await pool.query(
    `SELECT c.id, c.user_id, c.full_name, c.age, c.death_age, COALESCE(c.is_alive,true) AS is_alive, u.email, u.username, u.role AS user_role
     FROM characters c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [characterId],
  );
  const ch = c.rows[0] as
    | { id: string; user_id: string | null; full_name: string; age: number; death_age: number | null; is_alive: boolean; email: string | null; username: string | null; user_role: string | null }
    | undefined;
  if (!ch) throw AppError.notFound('Nhân vật');

  const targetRole = String(ch.user_role ?? 'player');
  const targetIsStaff = targetRole === 'admin' || targetRole === 'moderator';
  if (targetIsStaff && req.actorRole !== 'admin') {
    throw AppError.forbidden('Chỉ quản trị viên (admin) mới được thao tác với tài khoản quản trị/điều hành.');
  }
  if (req.actorRole === 'moderator' && targetRole !== 'player') {
    throw AppError.forbidden('Điều hành viên chỉ được thao tác với tài khoản người chơi.');
  }

  if (action === 'set_death_age') {
    if (ch.is_alive === false) {
      throw AppError.badRequest('Không thể cấu hình tuổi thọ cho nhân vật đã qua đời.');
    }
    const raw = body?.deathAge;
    let deathAge: number | null = null;
    if (raw !== undefined && raw !== null) {
      deathAge = Math.trunc(Number(raw));
      if (!Number.isFinite(deathAge) || deathAge < 1 || deathAge > 200) {
        throw AppError.badRequest('Tuổi thọ tối đa không hợp lệ (1 - 200).');
      }
      const currentAge = Number(ch.age ?? 0);
      if (deathAge <= currentAge) {
        throw AppError.badRequest(`Tuổi thọ tối đa phải lớn hơn tuổi hiện tại của nhân vật (${currentAge}).`);
      }
    } else {
      deathAge = null;
    }
    await pool.query(`UPDATE characters SET death_age = $2, updated_at = now() WHERE id = $1`, [characterId, deathAge]);
    await writeActionLog(pool as any, req.actorId, 'player.set_death_age', {
      characterId,
      characterName: ch.full_name,
      deathAge,
      previousDeathAge: ch.death_age ?? null,
      note: (body?.note ?? '').trim() || null,
    });
    if (ch.user_id) {
      try {
        await notify(pool as any, {
          userId: ch.user_id,
          kind: 'admin_action',
          title: 'Cấu hình tuổi thọ nhân vật',
          body: deathAge != null
            ? `Quản trị viên đã thiết lập tuổi thọ tối đa cho nhân vật "${ch.full_name}" là ${deathAge} tuổi. Khi đạt tuổi này, nhân vật sẽ qua đời và cần chuyển sang nhân vật kế tiếp.`
            : `Quản trị viên đã gỡ cấu hình tuổi thọ tối đa cho nhân vật "${ch.full_name}".`,
          payload: { action: 'set_death_age', characterId, deathAge },
        });
      } catch { /* ignore */ }
    }
    res.json({ ok: true, action, deathAge });
    return;
  }

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
    const amountMinor = Math.trunc(Number(body?.amount?.amount ?? 0));
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) throw AppError.badRequest('Số tiền không hợp lệ.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (action === 'fine') {
        const cur = await client.query<{ cash_minor: string }>(
          `SELECT cash_minor FROM characters WHERE id = $1 FOR UPDATE`,
          [characterId],
        );
        if (!cur.rows[0]) throw AppError.notFound('Nhân vật');
        const before = Number(cur.rows[0].cash_minor ?? 0);
        const actual = Math.min(before, amountMinor);
        if (actual > 0) {
          await creditStateFund(
            client as any,
            { ownerType: 'character', ownerId: characterId, kind: 'cash' },
            actual,
            {
              amountMinor: actual,
              reasonCode: 'admin_fine',
              description: `Phạt hành chính bởi admin vào quỹ đất nước${body?.note ? `: ${body.note}` : ''}`,
              refType: 'character',
              refId: characterId,
              actorType: 'admin',
              actorId: req.actorId ?? null,
              ledgerKind: 'admin_fine',
              ledgerDescription: 'Phạt hành chính (admin)',
              meta: { note: body?.note ?? null },
            },
          );
        }
        body.amount = body.amount ? { amount: actual } : body.amount;
      } else {
        try {
          await debitStateFund(
            client as any,
            { ownerType: 'character', ownerId: characterId, kind: 'cash' },
            amountMinor,
            {
              amountMinor: -amountMinor,
              reasonCode: 'admin_grant_aid',
              description: `Hỗ trợ từ quỹ đất nước (admin)${body?.note ? `: ${body.note}` : ''}`,
              refType: 'character',
              refId: characterId,
              actorType: 'admin',
              actorId: req.actorId ?? null,
              ledgerKind: 'admin_grant_aid',
              ledgerDescription: 'Hỗ trợ từ quỹ đất nước (admin)',
              meta: { note: body?.note ?? null },
            },
          );
        } catch (e: any) {
          if (String(e?.message).includes('STATE_FUND_INSUFFICIENT')) {
            throw AppError.conflict('state_fund_insufficient', 'Quỹ đất nước không đủ để cấp hỗ trợ.');
          }
          throw e;
        }
      }
      await client.query('COMMIT');
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
  const r = await pool.query(`SELECT current_day, current_year, season, macro, updated_at FROM game_state WHERE id = 1`);
  const row = r.rows[0] ?? { current_day: 0, current_year: GAME_START_YEAR, season: 'spring', macro: {}, updated_at: null };
  const macro = (row.macro && typeof row.macro === 'object') ? row.macro : {};
  const time = gameTimePayload(row);
  res.json({
    ...time,
    otRatePercent: Number((macro as any).otRatePercent ?? 300),
    restrictionContact: normalizeRestrictionContact((macro as any).restrictionContact),
    maintenance: normalizeMaintenance((macro as any).maintenance),
    macro,
  });
}

export async function updateGameConfig(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as {
    currentDay?: number;
    currentYear?: number;
    otRatePercent?: number;
    seasonRanges?: Array<{ season: string; startMonth: number; endMonth: number }>;
    seasonEffects?: Record<string, { productivityPct: number; energyPct: number; taxPct: number; revenuePct: number }>;
    macro?: Record<string, unknown>;
    restrictionContact?: Record<string, unknown>;
    maintenance?: Record<string, unknown>;
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
  if (body.maintenance != null) {
    nextMacro.maintenance = {
      ...normalizeMaintenance(prevMacro.maintenance),
      ...body.maintenance,
      updatedAt: new Date().toISOString(),
    };
  }
  // Cấu hình khoảng thời gian mùa (tháng bắt đầu - tháng kết thúc cho từng mùa); thay thế hoàn toàn cơ chế "chọn mùa" cũ.
  if (body.seasonRanges != null) {
    const normalized = normalizeSeasonRanges(body.seasonRanges);
    if (!normalized) {
      throw AppError.badRequest('Cấu hình mùa không hợp lệ: mỗi tháng game phải thuộc đúng 1 mùa và đủ 4 mùa (Xuân/Hạ/Thu/Đông).');
    }
    nextMacro.seasonRanges = normalized;
  }
  // Xóa cấu hình ghi đè mùa kiểu cũ (nếu còn trong dữ liệu macro).
  delete nextMacro.seasonOverride;

  // Hiệu ứng theo mùa (năng suất, thể lực, thuế, doanh thu) — cấu hình %.
  if (body.seasonEffects != null) {
    const normalizedEffects = normalizeSeasonEffects(body.seasonEffects);
    if (!normalizedEffects) {
      throw AppError.badRequest('Cấu hình hiệu ứng mùa không hợp lệ: giá trị phải là % từ 0 đến 300 cho cả 4 mùa.');
    }
    nextMacro.seasonEffects = normalizedEffects;
  }

  const stateRow = await pool.query<{ current_day: number; current_year: number }>(`SELECT current_day, current_year FROM game_state WHERE id = 1`);
  const curDay = Number(stateRow.rows[0]?.current_day ?? 0);
  const curYear = Number(stateRow.rows[0]?.current_year ?? GAME_START_YEAR);
  const nextDay = body.currentDay ?? curDay;
  const effectiveRanges = normalizeSeasonRanges((nextMacro as any).seasonRanges) ?? DEFAULT_SEASON_RANGES;
  const nextMonth = Math.floor((((Math.floor(nextDay) % 360) + 360) % 360) / 30) + 1;
  const nextSeason = getSeasonByMonthWithRanges(nextMonth, effectiveRanges);

  await pool.query(
    `INSERT INTO game_state (id, current_day, current_year, season, macro)
     VALUES (1, COALESCE($1,0), COALESCE($2,2000), $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       current_day = COALESCE($1, game_state.current_day),
       current_year = COALESCE($2, game_state.current_year),
       season = $3,
       macro = $4::jsonb,
       updated_at = now()`,
    [body.currentDay ?? null, body.currentYear ?? null, nextSeason, JSON.stringify(nextMacro)],
  );
  await writeActionLog(pool as any, req.actorId, 'game.config.update', {
    seasonRanges: (nextMacro as any).seasonRanges ?? null,
    seasonEffects: (nextMacro as any).seasonEffects ?? null,
    currentDay: body.currentDay ?? null,
    currentYear: body.currentYear ?? null,
    otRatePercent: (nextMacro as any).otRatePercent ?? null,
    restrictionContact: body.restrictionContact ? true : null,
    maintenance: body.maintenance != null ? normalizeMaintenance((nextMacro as any).maintenance) : null,
  });
  const maintenanceEnabled = !!normalizeMaintenance((nextMacro as any).maintenance).enabled;
  await publishToAllUsers('notification', {
    kind: 'info',
    title: maintenanceEnabled ? 'Hệ thống tạm dừng bảo trì' : 'Cấu hình hệ thống đã cập nhật',
    body: maintenanceEnabled
      ? 'Hệ thống đang tạm dừng để bảo trì/nâng cấp. Bạn có thể cần chờ đến khi hệ thống hoạt động lại.'
      : 'Cấu hình hệ thống đã được cập nhật bởi quản trị.',
    at: Date.now(),
  });
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
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : undefined,
  };
}

function normalizeMaintenance(raw: any) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: d.enabled === true,
    title: String(d.title ?? 'Hệ thống đang bảo trì').slice(0, 200),
    message: String(d.message ?? 'Hệ thống đang tạm dừng để nâng cấp hoặc sửa chữa. Vui lòng quay lại sau.').slice(0, 2000),
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : undefined,
  };
}

export async function getGameConfigPublic(_req: Request, res: Response): Promise<void> {
  const r = await pool.query(`SELECT current_day, current_year, season, macro, updated_at FROM game_state WHERE id = 1`);
  const row = r.rows[0] ?? { current_day: 0, current_year: GAME_START_YEAR, season: 'spring', macro: {}, updated_at: null };
  const macro = (row.macro && typeof row.macro === 'object') ? row.macro : {};
  const time = gameTimePayload(row);
  res.json({
    ...time,
    otRatePercent: Number((macro as any).otRatePercent ?? 300),
    restrictionContact: normalizeRestrictionContact((macro as any).restrictionContact),
    maintenance: normalizeMaintenance((macro as any).maintenance),
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
     VALUES (1, 0, 2000, 'spring', $1::jsonb)
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

export async function getInterestRateConfig(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const [stateRes, termsRes] = await Promise.all([
    pool.query(`SELECT macro FROM game_state WHERE id = 1`),
    pool.query(
      `SELECT term_months, annual_rate_pct, early_withdraw_penalty_pct, label
       FROM savings_rate_config ORDER BY term_months ASC`,
    ),
  ]);
  const macro = (stateRes.rows[0]?.macro && typeof stateRes.rows[0].macro === 'object') ? (stateRes.rows[0].macro as any) : {};
  const tierCfg = macro.accountTierConfig && typeof macro.accountTierConfig === 'object' ? (macro.accountTierConfig as any).thresholds : null;
  const dto: InterestRateConfigDto = {
    loanBaseRatePct: Number(macro.baseRatePct ?? 5),
    savingsTerms: termsRes.rows.map((r: any) => ({
      termMonths: Number(r.term_months),
      annualRatePct: Number(r.annual_rate_pct),
      earlyWithdrawPenaltyPct: Number(r.early_withdraw_penalty_pct ?? 0),
      label: String(r.label ?? ''),
    })),
    accountTierThresholds: {
      standard: 0,
      silver: Number(tierCfg?.silver ?? 50_000_000),
      gold: Number(tierCfg?.gold ?? 200_000_000),
      platinum: Number(tierCfg?.platinum ?? 1_000_000_000),
      diamond: Number(tierCfg?.diamond ?? 5_000_000_000),
    },
  };
  res.json(dto);
}

export async function updateInterestRateConfig(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as UpdateInterestRateConfigRequest;
  const loanBaseRatePct = Number(body.loanBaseRatePct);
  if (!Number.isFinite(loanBaseRatePct) || loanBaseRatePct < 0 || loanBaseRatePct > 100) {
    throw AppError.badRequest('Lãi suất cơ sở cho vay không hợp lệ (0-100%).');
  }
  const terms = Array.isArray(body.savingsTerms) ? body.savingsTerms : [];
  if (terms.length === 0) throw AppError.badRequest('Cần ít nhất một kỳ hạn tiết kiệm.');
  const seen = new Set<number>();
  for (const t of terms) {
    const m = Number(t.termMonths);
    if (!Number.isInteger(m) || m < 0 || m > 360) throw AppError.badRequest('Kỳ hạn tiết kiệm không hợp lệ.');
    if (seen.has(m)) throw AppError.badRequest(`Kỳ hạn ${m} tháng bị trùng.`);
    seen.add(m);
    if (!Number.isFinite(Number(t.annualRatePct)) || Number(t.annualRatePct) < 0 || Number(t.annualRatePct) > 100) {
      throw AppError.badRequest(`Lãi suất tiết kiệm kỳ hạn ${m} tháng không hợp lệ.`);
    }
    if (!Number.isFinite(Number(t.earlyWithdrawPenaltyPct)) || Number(t.earlyWithdrawPenaltyPct) < 0 || Number(t.earlyWithdrawPenaltyPct) > 100) {
      throw AppError.badRequest(`Phạt rút trước hạn kỳ hạn ${m} tháng không hợp lệ.`);
    }
    if (!String(t.label ?? '').trim()) throw AppError.badRequest(`Thiếu nhãn cho kỳ hạn ${m} tháng.`);
  }

  const tierInput = (body as any).accountTierThresholds ?? {};
  const tierThresholds = {
    standard: 0,
    silver: Math.max(0, Math.trunc(Number(tierInput.silver ?? 50_000_000))),
    gold: Math.max(0, Math.trunc(Number(tierInput.gold ?? 200_000_000))),
    platinum: Math.max(0, Math.trunc(Number(tierInput.platinum ?? 1_000_000_000))),
    diamond: Math.max(0, Math.trunc(Number(tierInput.diamond ?? 5_000_000_000))),
  };
  if ([tierThresholds.silver, tierThresholds.gold, tierThresholds.platinum, tierThresholds.diamond].some((x) => !Number.isFinite(x))) {
    throw AppError.badRequest('Ngưỡng xếp hạng tài khoản không hợp lệ.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT macro FROM game_state WHERE id = 1 FOR UPDATE`);
    const prevMacro = (existing.rows[0]?.macro && typeof existing.rows[0].macro === 'object') ? (existing.rows[0].macro as any) : {};
    const prevBaseRate = Number(prevMacro.baseRatePct ?? 5);
    const nextMacro = {
      ...prevMacro,
      baseRatePct: loanBaseRatePct,
      accountTierConfig: {
        ...(prevMacro.accountTierConfig && typeof prevMacro.accountTierConfig === 'object' ? prevMacro.accountTierConfig : {}),
        basis: 'net_worth_realestate_company',
        thresholds: tierThresholds,
        updatedAt: new Date().toISOString(),
      },
    };

    await client.query(
      `INSERT INTO game_state (id, current_day, current_year, season, macro)
       VALUES (1, 0, 2000, 'spring', $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET macro = $1::jsonb, updated_at = now()`,
      [JSON.stringify(nextMacro)],
    );

    for (const t of terms) {
      await client.query(
        `INSERT INTO savings_rate_config (term_months, annual_rate_pct, early_withdraw_penalty_pct, label)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (term_months) DO UPDATE SET
           annual_rate_pct = EXCLUDED.annual_rate_pct,
           early_withdraw_penalty_pct = EXCLUDED.early_withdraw_penalty_pct,
           label = EXCLUDED.label`,
        [
          Math.trunc(Number(t.termMonths)),
          Number(t.annualRatePct),
          Number(t.earlyWithdrawPenaltyPct ?? 0),
          String(t.label).trim().slice(0, 100),
        ],
      );
    }
    const keep = terms.map((t) => Math.trunc(Number(t.termMonths)));
    await client.query(
      `DELETE FROM savings_rate_config WHERE NOT (term_months = ANY($1::int[]))`,
      [keep],
    );

    await client.query('COMMIT');

    await writeActionLog(pool as any, req.actorId, 'banking.interest_config.update', {
      loanBaseRatePct: { before: prevBaseRate, after: loanBaseRatePct },
      savingsTermCount: terms.length,
      savingsTerms: terms.map((t) => ({ termMonths: t.termMonths, annualRatePct: t.annualRatePct })),
      accountTierThresholds: tierThresholds,
    });
    try {
      await publishToAllUsers('notification', {
        kind: 'info',
        title: 'Cấu hình lãi suất đã cập nhật',
        body: 'Quản trị viên đã cập nhật lãi suất vay ngân hàng và lãi suất gửi tiết kiệm.',
        at: Date.now(),
      });
    } catch { /* ignore */ }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await getInterestRateConfig(req, res);
}

export async function getStateFundSnapshot(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const balance = await getStateFundBalance(pool as any);
  const row = await pool.query<{ updated_at: Date | null }>(`SELECT updated_at FROM state_fund WHERE id = 1`);
  res.json({ balance: money(balance), updatedAt: row.rows[0]?.updated_at ? new Date(row.rows[0].updated_at).toISOString() : null });
}

export async function adminAdjustStateFund(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as AdjustStateFundRequest;
  const deltaMinor = Math.trunc(Number(body.deltaMinor));
  const reason = String(body.reason ?? '').trim();
  if (!Number.isFinite(deltaMinor) || deltaMinor === 0) throw AppError.badRequest('Số tiền điều chỉnh không hợp lệ (khác 0).');
  if (reason.length < 3) throw AppError.badRequest('Vui lòng nhập lý do điều chỉnh (tối thiểu 3 ký tự).');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await adjustStateFund(client as any, deltaMinor, {
        amountMinor: deltaMinor,
        reasonCode: 'admin_adjust',
        description: `Admin điều chỉnh quỹ đất nước: ${reason}`,
        refType: 'admin',
        refId: req.actorId ?? undefined,
        actorType: 'admin',
        actorId: req.actorId ?? undefined,
        meta: { reason },
        ledgerKind: 'state_fund_adjust',
        ledgerDescription: `Admin điều chỉnh quỹ đất nước (${deltaMinor > 0 ? '+' : ''}${deltaMinor})`,
      });
    } catch (e: any) {
      if (String(e?.message).includes('STATE_FUND_INSUFFICIENT')) {
        throw AppError.conflict('state_fund_insufficient', 'Quỹ đất nước không đủ để giảm theo mức yêu cầu.');
      }
      throw e;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await writeActionLog(pool as any, req.actorId, 'state_fund.adjust', { deltaMinor, reason });
  await getStateFundSnapshot(req, res);
}

export async function adminSupportCompaniesFromStateFund(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as SupportCompaniesFromStateFundRequest;
  const scope = body.scope === 'all' ? 'all' : 'selected';
  const amountPerCompanyMinor = Math.trunc(Number(body.amountPerCompanyMinor));
  const reason = String(body.reason ?? '').trim();
  const companyIds = Array.isArray(body.companyIds) ? body.companyIds : [];
  const tickers = Array.from(
    new Set((Array.isArray(body.tickers) ? body.tickers : []).map((t) => String(t ?? '').trim().toUpperCase()).filter(Boolean)),
  );
  if (!Number.isFinite(amountPerCompanyMinor) || amountPerCompanyMinor <= 0) {
    throw AppError.badRequest('Số tiền hỗ trợ mỗi công ty không hợp lệ.');
  }
  if (reason.length < 3) throw AppError.badRequest('Vui lòng nhập lý do hỗ trợ (tối thiểu 3 ký tự).');
  if (scope === 'selected' && companyIds.length === 0 && tickers.length === 0) {
    throw AppError.badRequest('Vui lòng nhập Mã chứng khoán của công ty cần hỗ trợ hoặc dùng phạm vi toàn bộ.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let result;
    try {
      result = await supportCompaniesFromStateFund(client as any, {
        scope,
        tickers,
        companyIds,
        amountPerCompanyMinor,
        reason,
        actorType: 'admin',
        actorId: req.actorId ?? null,
        refType: 'admin',
        refId: req.actorId ?? null,
      });
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg.includes('STATE_FUND_INSUFFICIENT')) throw AppError.conflict('state_fund_insufficient', 'Quỹ đất nước không đủ để hỗ trợ các công ty theo mức đã chọn.');
      if (msg.includes('TICKERS_NOT_FOUND')) throw AppError.badRequest('Không tìm thấy công ty đang niêm yết với Mã chứng khoán đã nhập.');
      if (msg.includes('NO_ELIGIBLE_COMPANIES') || msg.includes('NO_COMPANIES')) throw AppError.badRequest('Không tìm thấy công ty hợp lệ để hỗ trợ (đang hoạt động/IPO).');
      if (msg.includes('INVALID_AMOUNT')) throw AppError.badRequest('Số tiền hỗ trợ không hợp lệ.');
      throw e;
    }
    await client.query('COMMIT');

    await writeActionLog(pool as any, req.actorId, 'state_fund.support_companies', {
      scope,
      tickers: scope === 'selected' ? tickers : undefined,
      companyIds: scope === 'selected' && tickers.length === 0 ? companyIds : undefined,
      amountPerCompanyMinor,
      supportedCompanies: result.supportedCompanies,
      totalSpentMinor: result.totalSpentMinor,
      boostedTickers: result.boostedTickers,
      reason,
    });
    try {
      await publishToAllUsers('notification', {
        kind: 'market',
        title: 'Quỹ đất nước hỗ trợ doanh nghiệp',
        body: `Quỹ đất nước đã hỗ trợ ${result.supportedCompanies} công ty (${amountPerCompanyMinor.toLocaleString('vi-VN')} ₫/công ty), tổng ${result.totalSpentMinor.toLocaleString('vi-VN')} ₫. Biến động/thanh khoản thị trường có thể tăng.`,
        at: Date.now(),
      });
    } catch { /* ignore */ }

    res.json({
      ok: true,
      supportedCompanies: result.supportedCompanies,
      amountPerCompanyMinor: result.amountPerCompanyMinor,
      totalSpentMinor: result.totalSpentMinor,
      boostedTickers: result.boostedTickers,
      tickers: result.tickers,
      balanceAfter: money(result.balanceAfter),
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getIndustryRevenueConfigs(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const r = await pool.query(
    `SELECT industry_type AS "industryType", monthly_rate_pct AS "monthlyRatePct",
            min_revenue_minor AS "minRevenueMinor", max_revenue_minor AS "maxRevenueMinor",
            updated_by AS "updatedBy", updated_at AS "updatedAt"
     FROM industry_revenue_configs
     ORDER BY industry_type ASC`,
  );
  res.json(r.rows.map((row: any) => ({
    industryType: row.industryType,
    monthlyRatePct: Number(row.monthlyRatePct ?? 0),
    minRevenueMinor: Number(row.minRevenueMinor ?? 0),
    maxRevenueMinor: Number(row.maxRevenueMinor ?? 0),
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  })));
}

export async function upsertIndustryRevenueConfigs(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as { configs: Array<{ industryType: string; monthlyRatePct: number; minRevenueMinor: number; maxRevenueMinor: number }> };
  const configs = Array.isArray(body?.configs) ? body.configs : [];
  if (configs.length === 0) throw AppError.badRequest('Danh sách cấu hình trống.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const c of configs) {
      const industryType = String(c.industryType || '').trim();
      if (!industryType) continue;
      const monthlyRatePct = Number(c.monthlyRatePct ?? 0);
      const minRevenueMinor = Math.max(0, Math.trunc(Number(c.minRevenueMinor ?? 0)));
      const maxRevenueMinor = Math.max(0, Math.trunc(Number(c.maxRevenueMinor ?? 0)));
      if (!Number.isFinite(monthlyRatePct) || monthlyRatePct < 0) throw AppError.badRequest(`Tỉ lệ doanh thu không hợp lệ cho ${industryType}.`);
      if (maxRevenueMinor > 0 && maxRevenueMinor < minRevenueMinor) {
        throw AppError.badRequest(`max_revenue phải >= min_revenue cho ${industryType}.`);
      }
      await client.query(
        `INSERT INTO industry_revenue_configs (industry_type, monthly_rate_pct, min_revenue_minor, max_revenue_minor, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (industry_type) DO UPDATE SET
           monthly_rate_pct = EXCLUDED.monthly_rate_pct,
           min_revenue_minor = EXCLUDED.min_revenue_minor,
           max_revenue_minor = EXCLUDED.max_revenue_minor,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
        [industryType, monthlyRatePct, minRevenueMinor, maxRevenueMinor, req.actorId ?? null],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await writeActionLog(pool as any, req.actorId, 'company.industry_revenue_config.update', { count: configs.length });
  await getIndustryRevenueConfigs(req, res);
}

export async function getAdminMarketLogs(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  const r = await pool.query(
    `SELECT id, admin_id AS "adminId", scope, target_ids AS "targetIds", mode, delta_pct AS "deltaPct",
            duration_hours AS "durationHours", reason, created_at AS "createdAt"
     FROM admin_market_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  res.json(r.rows.map((row: any) => ({
    id: row.id,
    adminId: row.adminId ?? null,
    scope: row.scope,
    targetIds: Array.isArray(row.targetIds) ? row.targetIds : (row.targetIds ?? []),
    mode: row.mode,
    deltaPct: Number(row.deltaPct ?? 0),
    durationHours: row.durationHours == null ? null : Number(row.durationHours),
    reason: row.reason ?? '',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
  })));
}

export async function adminAdjustStockPrice(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = req.body as {
    mode: 'INSTANT_SHOCK' | 'TREND_BIAS';
    deltaPct: number;
    scope: 'ALL_MARKET' | 'SPECIFIC_COMPANIES';
    companyIds?: string[];
    durationHours?: number;
    reason: string;
  };

  const mode = body.mode;
  const scope = body.scope;
  const deltaPct = Number(body.deltaPct ?? 0);
  const reason = String(body.reason ?? '').trim();
  const companyIds = Array.from(new Set((body.companyIds ?? []).map((x) => String(x)).filter(Boolean)));
  const durationHours = body.durationHours == null ? null : Math.max(1, Math.trunc(Number(body.durationHours)));

  if (!['INSTANT_SHOCK', 'TREND_BIAS'].includes(mode)) throw AppError.badRequest('Chế độ không hợp lệ.');
  if (!['ALL_MARKET', 'SPECIFIC_COMPANIES'].includes(scope)) throw AppError.badRequest('Phạm vi không hợp lệ.');
  if (!Number.isFinite(deltaPct) || deltaPct < -50 || deltaPct > 50) throw AppError.badRequest('delta_pct phải trong khoảng -50% đến +50%.');
  if (!reason) throw AppError.badRequest('Vui lòng nhập lý do.');
  if (scope === 'SPECIFIC_COMPANIES' && companyIds.length === 0) throw AppError.badRequest('Cần chọn ít nhất một công ty.');
  if (mode === 'TREND_BIAS' && !durationHours) throw AppError.badRequest('TREND_BIAS yêu cầu duration_hours.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const targetIds: string[] = [];
    let affectedTickers = 0;
    if (mode === 'INSTANT_SHOCK') {
      const factor = 1 + deltaPct / 100;
      if (scope === 'ALL_MARKET') {
        const r = await client.query<{ id: string; company_id: string }>(
          `UPDATE stock_tickers st
              SET previous_close_minor = st.current_price_minor,
                  current_price_minor = GREATEST(100, ROUND((st.current_price_minor::numeric * $1::numeric))::bigint)
            FROM companies c
            WHERE c.id = st.company_id AND c.status = 'ipo'
          RETURNING st.id, st.company_id`,
          [factor],
        );
        affectedTickers = r.rowCount ?? 0;
        r.rows.forEach((x) => targetIds.push(x.company_id));
      } else {
        const r = await client.query<{ id: string; company_id: string }>(
          `UPDATE stock_tickers st
              SET previous_close_minor = st.current_price_minor,
                  current_price_minor = GREATEST(100, ROUND((st.current_price_minor::numeric * $2::numeric))::bigint)
            FROM companies c
            WHERE c.id = st.company_id AND c.status = 'ipo' AND c.id = ANY($1::uuid[])
          RETURNING st.id, st.company_id`,
          [companyIds, factor],
        );
        affectedTickers = r.rowCount ?? 0;
        r.rows.forEach((x) => targetIds.push(x.company_id));
      }
    }

    const logRes = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO admin_market_logs (id, admin_id, scope, target_ids, mode, delta_pct, duration_hours, reason)
       VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [req.actorId ?? null, scope, JSON.stringify(scope === 'ALL_MARKET' ? [] : companyIds), mode, deltaPct, durationHours, reason],
    );
    const logId = logRes.rows[0]!.id;

    if (mode === 'TREND_BIAS') {
      const hours = durationHours ?? 1;
      if (scope === 'ALL_MARKET') {
        await client.query(
          `INSERT INTO stock_market_biases (id, scope, ticker_id, bias_pct, ends_at, created_by, log_id)
           VALUES (gen_random_uuid(), 'ALL_MARKET', NULL, $1, now() + ($2::int * interval '1 hour'), $3, $4)`,
          [deltaPct, hours, req.actorId ?? null, logId],
        );
        affectedTickers = (await client.query(`SELECT COUNT(*)::int AS c FROM stock_tickers st JOIN companies c2 ON c2.id = st.company_id WHERE c2.status='ipo'`)).rows[0]?.c ?? 0;
      } else {
        const tickers = await client.query<{ id: string; company_id: string }>(
          `SELECT st.id, st.company_id FROM stock_tickers st JOIN companies c ON c.id = st.company_id WHERE c.status='ipo' AND c.id = ANY($1::uuid[])`,
          [companyIds],
        );
        for (const t of tickers.rows) {
          await client.query(
            `INSERT INTO stock_market_biases (id, scope, ticker_id, bias_pct, ends_at, created_by, log_id)
             VALUES (gen_random_uuid(), 'SPECIFIC_COMPANIES', $1, $2, now() + ($3::int * interval '1 hour'), $4, $5)`,
            [t.id, deltaPct, hours, req.actorId ?? null, logId],
          );
          targetIds.push(t.company_id);
        }
        affectedTickers = tickers.rows.length;
      }
    }

    await client.query('COMMIT');

    await writeActionLog(pool as any, req.actorId, 'admin.stock_market.adjust_price', {
      mode, scope, deltaPct, durationHours, reason, affectedTickers, targetCount: targetIds.length,
    });

    res.json({
      ok: true,
      mode,
      scope,
      deltaPct,
      durationHours,
      affectedTickers,
      logId,
      createdAt: logRes.rows[0]!.created_at ? new Date(logRes.rows[0]!.created_at).toISOString() : new Date().toISOString(),
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}



// --- AI config & status (admin) ---
function maskSecret(value: unknown): string {
  const s = typeof value === 'string' ? value : '';
  return s ? '********' : '';
}

function normalizeAiConfig(raw: any): any {
  const c = raw && typeof raw === 'object' ? raw : {};
  const endpoints = Array.isArray(c.openaiEndpoints) ? c.openaiEndpoints : [];
  const geminiKeysRaw = Array.isArray(c.geminiApiKeys) ? c.geminiApiKeys : [];
  return {
    provider: typeof c.provider === 'string' ? c.provider : 'router',
    failoverChain: typeof c.failoverChain === 'string' ? c.failoverChain : 'gemini,openai,fake',
    cooldownSec: Number.isFinite(Number(c.cooldownSec)) ? Number(c.cooldownSec) : 60,
    timeoutMs: Number.isFinite(Number(c.timeoutMs)) ? Number(c.timeoutMs) : 15000,
    openaiBaseUrl: typeof c.openaiBaseUrl === 'string' ? c.openaiBaseUrl : 'https://api.openai.com/v1',
    openaiModel: typeof c.openaiModel === 'string' ? c.openaiModel : '',
    openaiApiKey: typeof c.openaiApiKey === 'string' ? c.openaiApiKey : '',
    openaiEndpoints: endpoints.map((e: any) => ({
      name: typeof e?.name === 'string' ? e.name : '',
      baseUrl: typeof e?.baseUrl === 'string' ? e.baseUrl : (typeof e?.base_url === 'string' ? e.base_url : ''),
      apiKey: typeof e?.apiKey === 'string' ? e.apiKey : (typeof e?.api_key === 'string' ? e.api_key : ''),
      model: typeof e?.model === 'string' ? e.model : '',
      enabled: e?.enabled !== false,
    })),
    geminiModel: typeof c.geminiModel === 'string' ? c.geminiModel : '',
    geminiApiKey: typeof c.geminiApiKey === 'string' ? c.geminiApiKey : '',
    geminiApiKeys: geminiKeysRaw.map((k: any) => {
      if (typeof k === 'string') return { key: k, name: '', enabled: true };
      if (k && typeof k === 'object') {
        return {
          key: typeof k.key === 'string' ? k.key : (typeof k.apiKey === 'string' ? k.apiKey : ''),
          name: typeof k.name === 'string' ? k.name : '',
          enabled: k.enabled !== false,
        };
      }
      return { key: '', name: '', enabled: true };
    }).filter((k: any) => k.key || k.name),
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : null,
    note: typeof c.note === 'string' ? c.note : '',
  };
}

function maskAiConfig(cfg: any): any {
  return {
    ...cfg,
    openaiApiKey: maskSecret(cfg.openaiApiKey),
    openaiEndpoints: (cfg.openaiEndpoints || []).map((e: any) => ({ ...e, apiKey: maskSecret(e.apiKey) })),
    geminiApiKey: maskSecret(cfg.geminiApiKey),
    geminiApiKeys: (cfg.geminiApiKeys || []).map((k: any) => (typeof k === 'string' ? (k ? '********' : '') : { ...k, key: maskSecret(k?.key) })),
  };
}

function mergeSecrets(next: any, prev: any): any {
  const merged = { ...next };
  if (merged.openaiApiKey === '********') merged.openaiApiKey = prev.openaiApiKey || '';
  if (merged.geminiApiKey === '********') merged.geminiApiKey = prev.geminiApiKey || '';
  merged.openaiEndpoints = (next.openaiEndpoints || []).map((e: any, i: number) => {
    const pe = prev.openaiEndpoints?.[i] || {};
    return { ...e, apiKey: e.apiKey === '********' ? (pe.apiKey || '') : (e.apiKey || '') };
  });
  merged.geminiApiKeys = (next.geminiApiKeys || []).map((k: any, i: number) => {
    const pk = prev.geminiApiKeys?.[i];
    const prevKey = typeof pk === 'string' ? pk : (pk?.key || '');
    const nextKey = typeof k === 'string' ? k : (k?.key || '');
    const resolvedKey = nextKey === '********' ? prevKey : nextKey;
    if (typeof k === 'string') return resolvedKey;
    return { ...k, key: resolvedKey };
  });
  return merged;
}

export async function getAiConfigAdmin(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const r = await pool.query(`SELECT macro FROM game_state WHERE id = 1`);
  const macro = (r.rows[0]?.macro && typeof r.rows[0].macro === 'object') ? r.rows[0].macro : {};
  const cfg = normalizeAiConfig((macro as any).aiConfig);
  res.json({
    config: maskAiConfig(cfg),
    applyMode: 'auto-apply',
    note: 'Cấu hình được lưu vào DB và hệ thống sẽ tự áp dụng vào AI service runtime khi lưu (nếu AI service khả dụng). Bạn cũng có thể lưu lại để đồng bộ.',
  });
}

async function pushAiConfigToRuntime(cfg: any): Promise<{ applied: boolean; error?: string; errorCode?: string; detail?: any }> {
  const baseUrl = (env.AI_SERVICE_URL || '').replace(/\/$/, '');
  if (!baseUrl) return { applied: false, error: 'AI_SERVICE_URL chưa được cấu hình', errorCode: 'not_found' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(2000, env.AI_REQUEST_TIMEOUT_MS || 15000));
  try {
    const r = await fetch(`${baseUrl}/v1/ai-admin/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.AI_SERVICE_TOKEN ? { 'x-ai-token': env.AI_SERVICE_TOKEN } : {}),
      },
      body: JSON.stringify({ config: cfg }),
      signal: controller.signal,
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (r.status === 404) {
      return { applied: false, error: '404 (Không tìm thấy dịch vụ AI)', errorCode: 'not_found', detail: data };
    }
    if (r.status >= 500) {
      return { applied: false, error: '5xx (Lỗi nội bộ AI Service)', errorCode: 'ai_internal_error', detail: data };
    }
    if (!r.ok) return { applied: false, error: `AI service trả về ${r.status}`, errorCode: 'ai_error', detail: data };
    if (data && data.applied === false) return { applied: false, error: data.error || 'AI service không áp dụng được cấu hình', detail: data };
    return { applied: true, detail: data };
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError';
    return {
      applied: false,
      error: isTimeout ? 'Timeout (AI phản hồi quá chậm)' : '404 (Không tìm thấy dịch vụ AI)',
      errorCode: isTimeout ? 'timeout' : 'unreachable',
      detail: String(e?.message || e),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Reapply the last admin-saved provider config after the AI container restarts. */
export async function syncSavedAiConfigToRuntime(): Promise<{ configured: boolean; applied: boolean; error?: string }> {
  const result = await pool.query(`SELECT macro FROM game_state WHERE id = 1`);
  const macro = result.rows[0]?.macro && typeof result.rows[0].macro === 'object'
    ? result.rows[0].macro as Record<string, unknown>
    : {};
  if (!macro.aiConfig || typeof macro.aiConfig !== 'object') {
    return { configured: false, applied: false };
  }

  const apply = await pushAiConfigToRuntime(normalizeAiConfig(macro.aiConfig));
  return { configured: true, applied: apply.applied, ...(apply.error ? { error: apply.error } : {}) };
}

export async function updateAiConfigAdmin(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const body = (req.body ?? {}) as any;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT macro FROM game_state WHERE id = 1 FOR UPDATE`);
    const prevMacro = (existing.rows[0]?.macro && typeof existing.rows[0].macro === 'object') ? existing.rows[0].macro : {};
    const prevCfg = normalizeAiConfig((prevMacro as any).aiConfig);
    let nextCfg = normalizeAiConfig(body.config ?? body);
    nextCfg = mergeSecrets(nextCfg, prevCfg);
    nextCfg.updatedAt = new Date().toISOString();

    const nextMacro = { ...prevMacro, aiConfig: nextCfg };
    await client.query(
      `INSERT INTO game_state (id, current_day, current_year, season, macro)
       VALUES (1, 0, $1, 'spring', $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET macro = $2::jsonb, updated_at = now()`,
      [GAME_START_YEAR, JSON.stringify(nextMacro)],
    );

    await writeActionLog(client as any, req.actorId, 'admin.ai.config.update', {
      provider: nextCfg.provider,
      failoverChain: nextCfg.failoverChain,
      endpoints: Array.isArray(nextCfg.openaiEndpoints) ? nextCfg.openaiEndpoints.length : 0,
      geminiKeys: Array.isArray(nextCfg.geminiApiKeys) ? nextCfg.geminiApiKeys.length : 0,
    });
    await client.query('COMMIT');

    // Tự áp dụng cấu hình vào AI service runtime (best-effort). DB đã lưu thành công.
    const apply = await pushAiConfigToRuntime(nextCfg);
    res.json({
      ok: true,
      config: maskAiConfig(nextCfg),
      applyMode: apply.applied ? 'saved-and-applied' : 'saved-only',
      applied: apply.applied,
      applyError: apply.error ?? null,
      note: apply.applied
        ? 'Đã lưu cấu hình và áp dụng vào AI service runtime.'
        : `Đã lưu cấu hình vào DB nhưng chưa áp dụng runtime: ${apply.error || 'không rõ lỗi'}.`,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getAiStatusProxy(req: Request, res: Response): Promise<void> {
  ensureAdmin(req);
  const baseUrl = (env.AI_SERVICE_URL || '').replace(/\/$/, '');
  if (!baseUrl) {
    res.status(503).json({ ready: false, error: '404 (Không tìm thấy dịch vụ AI)', errorCode: 'not_found', detail: 'AI_SERVICE_URL chưa được cấu hình' });
    return;
  }
  const controller = new AbortController();
  const timeoutMs = Math.max(2000, env.AI_REQUEST_TIMEOUT_MS || 15000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...(env.AI_SERVICE_TOKEN ? { 'x-ai-token': env.AI_SERVICE_TOKEN } : {}) } as Record<string, string>;

  const parseBody = async (r: globalThis.Response) => {
    const text = await r.text();
    try { return text ? JSON.parse(text) : null; } catch { return { raw: text }; }
  };

  try {
    // 1) Ưu tiên endpoint trạng thái quản trị của AI service
    let r = await fetch(`${baseUrl}/v1/ai-admin/status`, { headers, signal: controller.signal });
    let data = await parseBody(r);

    // 2) Fallback: nếu AI service không có endpoint admin status, dùng /health
    if (r.status === 404) {
      const h = await fetch(`${baseUrl}/health`, { headers, signal: controller.signal });
      const hData = await parseBody(h);
      if (h.ok) {
        res.json({
          ready: true,
          mode: 'health',
          provider: (hData && ((hData as any).provider || (hData as any).mode)) || 'unknown',
          source: 'health',
          detail: hData,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }
      if (h.status === 404) {
        res.status(404).json({ ready: false, error: '404 (Không tìm thấy dịch vụ AI)', errorCode: 'not_found', detail: hData });
        return;
      }
      if (h.status >= 500) {
        res.status(502).json({ ready: false, error: '5xx (Lỗi nội bộ AI Service)', errorCode: 'ai_internal_error', detail: hData });
        return;
      }
      r = h as any;
      data = hData;
    }

    if (r.ok) {
      res.json({ ready: true, ...(data as any), fetchedAt: new Date().toISOString() });
      return;
    }

    if (r.status >= 500) {
      res.status(502).json({ ready: false, error: '5xx (Lỗi nội bộ AI Service)', errorCode: 'ai_internal_error', detail: data });
      return;
    }

    res.status(502).json({ ready: false, error: `AI service trả về ${r.status}`, errorCode: 'ai_error', detail: data });
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError';
    res.status(502).json({
      ready: false,
      error: isTimeout ? 'Timeout (AI phản hồi quá chậm)' : '404 (Không tìm thấy dịch vụ AI)',
      errorCode: isTimeout ? 'timeout' : 'unreachable',
      detail: String(e?.message || e),
    });
  } finally {
    clearTimeout(timeout);
  }
}
