import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import { enqueueDomainEvent } from '../outboxEvents.js';
import { publishClient } from '../publisher.js';
import { env } from '../config/env.js';
import { Rooms } from '@efls/contracts';
import { accrueSimpleInterest, computeGameAge, DEFAULT_SEASON_RANGES, deriveCanonicalGameTime, evaluateLoanHealth, GAME_DAYS_PER_YEAR, GAME_START_YEAR, generateCccd, normalizeSeasonRanges, resolveSeasonEffects } from '@efls/domain';
import { syncNpcRuntime } from './npcRuntime.js';
import { processProductionOrders } from './productionTick.js';

type LedgerOwnerType = 'character' | 'company' | 'bank' | 'government' | 'market' | 'escrow';
type LedgerAccountKind = 'cash' | 'savings' | 'escrow' | 'clearing';

interface LedgerLeg {
  ownerType: LedgerOwnerType;
  ownerId: string;
  kind?: LedgerAccountKind;
  deltaMinor: number;
}

const SYSTEM_GOVERNMENT_ID = '00000000-0000-0000-0000-000000000002';
const SYSTEM_BANK_ID = '00000000-0000-4000-8000-0000000000b1';

/** Khóa advisory cho tick: chỉ một tick được chạy tại một thời điểm. */
const GAME_TICK_LOCK_ID = 774_311_001;

function isSystemOwner(ownerType: LedgerOwnerType): boolean {
  return ownerType !== 'character' && ownerType !== 'company';
}

function sortLegs(legs: LedgerLeg[]): LedgerLeg[] {
  return [...legs].sort((a, b) => {
    const ak = `${a.ownerType}:${a.ownerId}:${a.kind ?? 'cash'}`;
    const bk = `${b.ownerType}:${b.ownerId}:${b.kind ?? 'cash'}`;
    return ak.localeCompare(bk);
  });
}

async function getOrCreateLedgerAccount(
  client: PoolClient,
  ownerType: LedgerOwnerType,
  ownerId: string,
  kind: LedgerAccountKind,
): Promise<{ id: string; balanceMinor: number }> {
  const system = isSystemOwner(ownerType);
  const result = await client.query<{ id: string; balance_minor: string }>(
    `INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, balance_minor, is_system)
     VALUES (gen_random_uuid(), $1, $2, $3, 0, $4)
     ON CONFLICT (owner_type, owner_id, kind, currency)
     DO UPDATE SET owner_type = EXCLUDED.owner_type
     RETURNING id, balance_minor`,
    [ownerType, ownerId, kind, system],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Failed to get/create ledger account ${ownerType}:${ownerId}:${kind}`);
  return { id: row.id, balanceMinor: Number(row.balance_minor) };
}

async function postLedger(
  client: PoolClient,
  input: { kind: string; description: string; legs: LedgerLeg[]; referenceType?: string; referenceId?: string },
): Promise<string> {
  const normalized = input.legs.map((leg) => ({ ...leg, kind: leg.kind ?? 'cash' as LedgerAccountKind }));
  if (normalized.length < 2) throw new Error('Ledger transaction requires at least two legs');
  const sum = normalized.reduce((acc, l) => acc + l.deltaMinor, 0);
  if (sum !== 0) throw new Error(`Ledger legs must balance (sum=${sum})`);
  if (normalized.some((l) => !Number.isInteger(l.deltaMinor) || l.deltaMinor === 0)) {
    throw new Error('Ledger legs must have non-zero integer deltaMinor');
  }

  const sorted = sortLegs(normalized);
  const keys = sorted.map((l) => `${l.ownerType}\0${l.ownerId}\0${l.kind}`);
  const uniqueKeys = Array.from(new Set(keys));
  const accounts = new Map<string, { id: string; balanceMinor: number }>();
  for (const key of uniqueKeys) {
    const [ownerType, ownerId, kind] = key.split('\0') as [LedgerOwnerType, string, LedgerAccountKind];
    let locked = await client.query<{ id: string; balance_minor: string }>(
      `SELECT id, balance_minor FROM ledger_accounts
       WHERE owner_type = $1 AND owner_id = $2 AND kind = $3 AND currency = 'VND'
       FOR UPDATE`,
      [ownerType, ownerId, kind],
    );
    if (!locked.rows[0]) {
      await getOrCreateLedgerAccount(client, ownerType, ownerId, kind);
      locked = await client.query<{ id: string; balance_minor: string }>(
        `SELECT id, balance_minor FROM ledger_accounts
         WHERE owner_type = $1 AND owner_id = $2 AND kind = $3 AND currency = 'VND'
         FOR UPDATE`,
        [ownerType, ownerId, kind],
      );
    }
    if (!locked.rows[0]) throw new Error(`Failed to lock ledger account ${key}`);

    let balanceMinor = Number(locked.rows[0].balance_minor);
    // Reconcile legacy direct cash mutations: keep canonical cash as source of truth.
    if (kind === 'cash' && ownerType === 'character') {
      const c = await client.query<{ cash_minor: string }>(
        `SELECT cash_minor FROM characters WHERE id = $1 FOR UPDATE`,
        [ownerId],
      );
      if (c.rows[0]) {
        const canonical = Number(c.rows[0].cash_minor);
        if (canonical !== balanceMinor) {
          await client.query(
            `UPDATE ledger_accounts SET balance_minor = $4, updated_at = now()
             WHERE owner_type = $1 AND owner_id = $2 AND kind = $3 AND currency = 'VND'`,
            [ownerType, ownerId, kind, canonical],
          );
          balanceMinor = canonical;
        }
      }
    } else if (kind === 'cash' && ownerType === 'company') {
      const co = await client.query<{ cash_minor: string }>(
        `SELECT cash_minor FROM companies WHERE id = $1 FOR UPDATE`,
        [ownerId],
      );
      if (co.rows[0]) {
        const canonical = Number(co.rows[0].cash_minor);
        if (canonical !== balanceMinor) {
          await client.query(
            `UPDATE ledger_accounts SET balance_minor = $4, updated_at = now()
             WHERE owner_type = $1 AND owner_id = $2 AND kind = $3 AND currency = 'VND'`,
            [ownerType, ownerId, kind, canonical],
          );
          balanceMinor = canonical;
        }
      }
    }
    accounts.set(key, { id: locked.rows[0].id, balanceMinor });
  }

  for (const leg of sorted) {
    const key = `${leg.ownerType}\0${leg.ownerId}\0${leg.kind}`;
    const acc = accounts.get(key)!;
    const next = acc.balanceMinor + leg.deltaMinor;
    if (next < 0 && !isSystemOwner(leg.ownerType) && leg.kind !== 'clearing') {
      throw new Error(`insufficient_funds ledger ${key} would become ${next}`);
    }
    acc.balanceMinor = next;
  }

  const tx = await client.query<{ id: string }>(
    `INSERT INTO ledger_transactions (id, kind, description, reference_type, reference_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4)
     RETURNING id`,
    [input.kind, input.description, input.referenceType ?? null, input.referenceId ?? null],
  );
  const txId = tx.rows[0]!.id;
  for (const leg of sorted) {
    const acc = accounts.get(`${leg.ownerType}\0${leg.ownerId}\0${leg.kind}`)!;
    await client.query(
      `INSERT INTO ledger_entries (id, transaction_id, account_id, delta_minor)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [txId, acc.id, leg.deltaMinor],
    );
  }
  for (const [key, acc] of accounts.entries()) {
    const [ownerType, ownerId, kind] = key.split('\0') as [LedgerOwnerType, string, LedgerAccountKind];
    await client.query(
      `UPDATE ledger_accounts SET balance_minor = $4, updated_at = now()
       WHERE owner_type = $1 AND owner_id = $2 AND kind = $3 AND currency = 'VND'`,
      [ownerType, ownerId, kind, acc.balanceMinor],
    );
    if (ownerType === 'character' && kind === 'cash') {
      await client.query(`UPDATE characters SET cash_minor = $2, updated_at = now() WHERE id = $1`, [ownerId, acc.balanceMinor]);
    } else if (ownerType === 'company' && kind === 'cash') {
      await client.query(`UPDATE companies SET cash_minor = $2, updated_at = now() WHERE id = $1`, [ownerId, acc.balanceMinor]);
    }
  }
  return txId;
}

export interface GameTickResult {
  tick: number;
  inGameYear: number;
  inGameMonth: number;
  inGameDay: number;
  dayOfYear: number;
  season: string;
  applied: string[];
}

async function recordCharacterIncome(
  client: PoolClient,
  characterId: string,
  amountMinor: number,
  periodKey: string,
): Promise<void> {
  if (amountMinor <= 0) return;
  await client.query(
    `INSERT INTO character_monthly_income (character_id, period_key, income_minor, support_deducted_minor, updated_at)
     VALUES ($1, $2, $3::bigint, 0, now())
     ON CONFLICT (character_id, period_key)
     DO UPDATE SET income_minor = character_monthly_income.income_minor + EXCLUDED.income_minor, updated_at = now()`,
    [characterId, periodKey, Math.round(amountMinor)],
  ).catch(() => {});
}

async function applyImmediateChildSupportFromIncome(
  client: PoolClient,
  payerCharacterId: string,
  incomeAmountMinor: number,
  periodKey: string,
): Promise<number> {
  const income = Math.max(0, Math.round(incomeAmountMinor));
  if (income <= 0) return 0;
  await recordCharacterIncome(client, payerCharacterId, income, periodKey);

  const obligations = await client.query<{
    custodial_parent_id: string;
    child_id: string;
  }>(
    `SELECT DISTINCT c.custodial_parent_id, c.id AS child_id
     FROM characters c
     WHERE c.child_support_payer_id = $1
       AND COALESCE(c.child_support_percent, 0) = 20
       AND c.custodial_parent_id IS NOT NULL
       AND COALESCE(c.is_alive,true) = true
       AND COALESCE(c.is_dependent,false) = true
       AND COALESCE(c.dependent_status,'child') IN ('infant','child')
       AND c.age < 18`,
    [payerCharacterId],
  );
  if (obligations.rows.length === 0) return 0;

  // 20% thu nhập/tháng: trích theo khoản thu nhập ghi nhận (áp dụng ngay khi phát sinh lương/thu nhập tháng)
  const totalSupport = Math.max(0, Math.floor(income * 0.2));
  if (totalSupport <= 0) return 0;

  // If multiple custodial parents exist (edge case), split equally.
  const custodians = Array.from(new Set(obligations.rows.map((r) => r.custodial_parent_id).filter(Boolean))) as string[];
  if (custodians.length === 0) return 0;
  const perCustodian = Math.floor(totalSupport / custodians.length);
  let deducted = 0;
  for (let i = 0; i < custodians.length; i++) {
    const custodianId = custodians[i]!;
    const amount = i === custodians.length - 1 ? (totalSupport - deducted) : perCustodian;
    if (amount <= 0) continue;
    try {
      await postLedger(client, {
        kind: 'child_support',
        description: 'Cấp dưỡng con cái (20% thu nhập/tháng)',
        referenceType: 'character',
        referenceId: payerCharacterId,
        legs: [
          { ownerType: 'character', ownerId: payerCharacterId, kind: 'cash', deltaMinor: -amount },
          { ownerType: 'character', ownerId: custodianId, kind: 'cash', deltaMinor: amount },
        ],
      });
      deducted += amount;
    } catch {
      // insufficient funds or ledger issue: skip this portion
    }
  }
  if (deducted > 0) {
    await client.query(
      `INSERT INTO character_monthly_income (character_id, period_key, income_minor, support_deducted_minor, updated_at)
       VALUES ($1, $2, 0, $3::bigint, now())
       ON CONFLICT (character_id, period_key)
       DO UPDATE SET support_deducted_minor = character_monthly_income.support_deducted_minor + EXCLUDED.support_deducted_minor, updated_at = now()`,
      [payerCharacterId, periodKey, deducted],
    ).catch(() => {});
  }
  return deducted;
}

async function deductHealthInsuranceFromSalary(
  client: PoolClient,
  characterId: string,
  grossSalaryMinor: number,
  periodKey: string,
  nowIso: string,
): Promise<number> {
  const gross = Math.max(0, Math.round(Number(grossSalaryMinor ?? 0)));
  if (gross <= 0) return 0;
  try {
    const enr = await client.query<{ is_active: boolean; contribution_rate_pct: string | number }>(
      `SELECT is_active, contribution_rate_pct
       FROM health_insurance_enrollments
       WHERE character_id = $1`,
      [characterId],
    ).catch(() => ({ rows: [] as any[] }));
    const row = enr.rows[0];
    if (!row || row.is_active === false) return 0;
    const rate = Math.max(0, Math.min(50, Number(row.contribution_rate_pct ?? 0)));
    if (rate <= 0) return 0;
    const contribution = Math.max(0, Math.round(gross * (rate / 100)));
    if (contribution <= 0) return 0;

    await postLedger(client, {
      kind: 'health_insurance_contribution',
      description: `Đóng góp bảo hiểm y tế/an sinh (${rate}% lương, kỳ ${periodKey})`,
      referenceType: 'character',
      referenceId: characterId,
      legs: [
        { ownerType: 'character', ownerId: characterId, kind: 'cash', deltaMinor: -contribution },
        { ownerType: 'bank', ownerId: SYSTEM_BANK_ID, kind: 'cash', deltaMinor: contribution },
      ],
    });

    await client.query(`INSERT INTO insurance_fund (id, balance_minor) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`).catch(() => {});
    await client.query(
      `UPDATE insurance_fund SET balance_minor = balance_minor + $1, updated_at = now() WHERE id = 1`,
      [contribution],
    ).catch(() => {});
    await client.query(
      `INSERT INTO insurance_fund_transactions
         (amount_minor, reason_code, description, ref_type, ref_id, actor_type, actor_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        contribution,
        'salary_contribution',
        `Trích ${rate}% lương kỳ ${periodKey}`,
        'character',
        characterId,
        'system',
        null,
        JSON.stringify({ periodKey, grossSalaryMinor: gross, ratePct: rate, at: nowIso }),
      ],
    ).catch(() => {});
    return contribution;
  } catch {
    return 0;
  }
}

let tick = 0;

export async function processGameTick(): Promise<GameTickResult> {
  tick += 1;
  const now = new Date();
  logger.info({ tick, now }, 'Game tick started');

  const client = await pool.connect();
  const startedAt = Date.now();
  try {
    await client.query('BEGIN');

    // Chống 2 tick chạy chồng (deploy/restart/queue trễ). Khóa tự nhả khi
    // COMMIT/ROLLBACK nên không sợ rò rỉ khóa khi lỗi.
    const lockRes = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1) AS locked',
      [GAME_TICK_LOCK_ID],
    );
    if (!lockRes.rows[0]?.locked) {
      await client.query('ROLLBACK');
      const stateRes = await client.query<{
        current_day: string;
        current_year: string;
        season: string;
      }>(`SELECT current_day, current_year, season FROM game_state WHERE id = 1`);
      const skippedDay = Number(stateRes.rows[0]?.current_day ?? 0);
      const skippedYear = Number(stateRes.rows[0]?.current_year ?? GAME_START_YEAR);
      const normalizedSkipped = ((Math.floor(skippedDay) % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;
      logger.warn({ tick }, 'Game tick skipped: previous tick still running');
      return {
        tick,
        inGameYear: Math.max(GAME_START_YEAR, Math.floor(skippedYear)),
        inGameMonth: Math.floor(normalizedSkipped / 30) + 1,
        inGameDay: (normalizedSkipped % 30) + 1,
        dayOfYear: normalizedSkipped,
        season: String(stateRes.rows[0]?.season ?? 'spring'),
        applied: ['skipped: previous tick still running'],
      };
    }

    // Giới hạn thời gian chờ khóa và thời gian câu lệnh: tick không được phép
    // treo vô hạn và làm mọi thao tác người chơi phải chờ.
    await client.query(
      `SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true)`,
      [`${env.GAME_TICK_LOCK_TIMEOUT_MS}ms`, `${env.GAME_TICK_STATEMENT_TIMEOUT_MS}ms`],
    );

    const applied: string[] = [];

    // ---- 1. Advance game clock ----
    // Chuẩn hệ thống: 1 tick = 1 ngày game = 1 phút thực tế, 1 năm = 360 ngày (12 tháng x 30 ngày)
    const gameState = await client.query<{
      current_day: string;
      current_year: string;
      season: string;
      macro: any;
    }>(`SELECT current_day, current_year, season, macro FROM game_state WHERE id = 1`);

    const currentDayRaw = Number(gameState.rows[0]?.current_day ?? 0);
    const currentYear = Number(gameState.rows[0]?.current_year ?? GAME_START_YEAR);
    const macro = (gameState.rows[0]?.macro && typeof gameState.rows[0].macro === 'object') ? { ...(gameState.rows[0].macro as any) } : {};
    const normalizedCurrentDay = ((Math.floor(currentDayRaw) % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;

    if (macro?.maintenance?.enabled === true) {
      await client.query('COMMIT');
      logger.info({ tick }, 'Game tick skipped: maintenance enabled');
      return {
        tick,
        inGameYear: Math.max(GAME_START_YEAR, Math.floor(currentYear)),
        inGameMonth: Math.floor(normalizedCurrentDay / 30) + 1,
        inGameDay: (normalizedCurrentDay % 30) + 1,
        dayOfYear: normalizedCurrentDay,
        season: String(gameState.rows[0]?.season ?? 'spring'),
        applied: ['maintenance: paused'],
      };
    }

    let nextDay = normalizedCurrentDay + 1;
    let nextYear = currentYear;
    if (nextDay >= GAME_DAYS_PER_YEAR) {
      nextDay = 0;
      nextYear += 1;
    }
    // Mùa theo cấu hình khoảng thời gian mùa (tháng bắt đầu - kết thúc) do admin thiết lập
    const seasonRanges = normalizeSeasonRanges(macro?.seasonRanges) ?? DEFAULT_SEASON_RANGES;
    const nextTime = deriveCanonicalGameTime({ dayOfYear: nextDay, year: nextYear, seasonRanges });
    const nextSeason = nextTime.season;
    // Hiệu ứng kinh tế/xã hội của mùa (năng suất, thể lực, thuế, doanh thu)
    const seasonEffects = resolveSeasonEffects(nextSeason, (macro as any)?.seasonEffects);
    // Bỏ cấu hình ghi đè mùa kiểu cũ nếu còn sót trong macro
    if (macro?.seasonOverride) delete macro.seasonOverride;

    await client.query(
      `UPDATE game_state SET current_day = $1, current_year = $2, season = $3, macro = $4::jsonb, updated_at = now() WHERE id = 1`,
      [nextDay, nextYear, nextSeason, JSON.stringify(macro)],
    );
    applied.push(`game_state: day=${nextDay} month=${nextTime.month} dayOfMonth=${nextTime.day} year=${nextYear} season=${nextSeason}`);

    // ---- 2. Character aging, health, energy ----
    const characters = await client.query<{
      id: string;
      age: number;
      health_energy: number;
      death_age: number | null;
      birth_game_year: number | null;
      birth_game_day: number | null;
      is_alive: boolean | null;
      last_active_at: Date | null;
      stamina_month_key: string | null;
      stamina_month_fully_active: boolean | null;
      stamina_month_days_count: number | null;
    }>(
      `SELECT id, age, health_energy, death_age, birth_game_year, birth_game_day, is_alive, last_active_at,
              stamina_month_key, stamina_month_fully_active, stamina_month_days_count
       FROM characters WHERE COALESCE(is_alive,true)=true`,
    );

    for (const c of characters.rows) {
      // Tuổi tính theo thời gian game hệ thống (1 năm = 360 ngày), tự tăng kể cả khi trước đó bỏ lỡ tick/offline.
      let nextAge: number;
      if (c.birth_game_year != null && c.birth_game_day != null) {
        nextAge = computeGameAge({
          birthYear: Number(c.birth_game_year),
          birthDayOfYear: Number(c.birth_game_day),
          currentYear: nextYear,
          currentDayOfYear: nextDay,
        });
      } else {
        // Fallback tương thích dữ liệu cũ: tăng 1 tuổi mỗi lần qua năm game.
        nextAge = Number(c.age ?? 0) + (nextDay === 0 ? 1 : 0);
      }
      const deathAge = c.death_age != null ? Number(c.death_age) : 80;
      if (nextAge >= deathAge) {
        nextAge = deathAge;
      }

      // Hao hụt thể lực theo tỉ lệ /tháng game (tỉ lệ 100% = 20 điểm) và mùa.
      // Chỉ trừ khi nhân vật hoạt động đầy đủ 1 tháng game (mọi ngày trong tháng đều hoạt động gần đây), trừ vào cuối tháng (khi bước sang tháng mới).
      // Không trừ sức khỏe khi offline/bỏ lỡ hoạt động trong tháng.
      const lastActiveAt = c.last_active_at ? new Date(c.last_active_at as any).getTime() : 0;
      const isRecentlyActive = lastActiveAt > 0 && Date.now() - lastActiveAt <= 5 * 60 * 1000;
      const tickMonthKey = `${nextYear}-${String(nextTime.month).padStart(2, '0')}`;
      const prevMonthKey = c.stamina_month_key;

      let newHealth = Math.max(0, Math.min(100, Math.round(Number(c.health_energy) || 0)));
      let trackKey = tickMonthKey;
      let trackFullyActive = isRecentlyActive;
      let trackDays = 1;

      if (prevMonthKey !== tickMonthKey) {
        // Bước sang tháng mới: quyết toán tháng trước (nếu đã hoạt động đầy đủ 30 ngày) rồi bắt đầu theo dõi tháng hiện tại.
        if (prevMonthKey && c.stamina_month_fully_active && Number(c.stamina_month_days_count ?? 0) === 30) {
          const [pyStr, pmStr] = String(prevMonthKey).split('-');
          const prevYearNum = Number(pyStr);
          const prevMonthNum = Number(pmStr);
          if (Number.isFinite(prevYearNum) && Number.isFinite(prevMonthNum) && prevMonthNum >= 1 && prevMonthNum <= 12) {
            const prevDayOfYear = (prevMonthNum - 1) * 30;
            const prevTime = deriveCanonicalGameTime({ dayOfYear: prevDayOfYear, year: prevYearNum, seasonRanges });
            const prevEffects = resolveSeasonEffects(prevTime.season, (macro as any)?.seasonEffects);
            const prevEnergyFactor = Number(prevEffects.energy ?? 1);
            const monthlyDrain = prevEnergyFactor <= 0 ? 0 : Math.max(1, Math.round(20 * prevEnergyFactor));
            newHealth = Math.max(0, Math.min(100, newHealth - monthlyDrain));
          }
        }
        trackKey = tickMonthKey;
        trackFullyActive = isRecentlyActive;
        trackDays = 1;
      } else {
        const prevDays = Number(c.stamina_month_days_count ?? 0);
        trackKey = tickMonthKey;
        trackDays = prevDays + 1;
        trackFullyActive = (prevDays === 0 ? isRecentlyActive : Boolean(c.stamina_month_fully_active)) && isRecentlyActive;
      }

      await client.query(
        `UPDATE characters
            SET age = $1,
                health_energy = $2,
                stamina_month_key = $3,
                stamina_month_fully_active = $4,
                stamina_month_days_count = $5,
                updated_at = now()
          WHERE id = $6`,
        [nextAge, newHealth, trackKey, trackFullyActive, trackDays, c.id],
      );
    }
    applied.push(`characters: ${characters.rows.length} updated`);

    // ---- 2b. Finalize employment resignations (notice period ended) ----
    // Chuyển notice_pending -> resigned khi đến/qua ngày hiệu lực, giải phóng vị trí tuyển dụng,
    // và thanh toán lương kỳ dở dang (prorate) nếu kỳ tháng hiện tại chưa được trả.
    try {
      const currentAbs = nextYear * GAME_DAYS_PER_YEAR + nextDay;
      const pendingResigns = await client.query<{
        id: string;
        character_id: string;
        company_id: string | null;
        company_status: string | null;
        company_name: string | null;
        job_id: string;
        salary_minor: string;
        salary_arrears_minor: string;
        last_salary_period_key: string | null;
        effective_resign_game_year: number | null;
        effective_resign_game_day: number | null;
        is_owner_role: boolean;
      }>(
        `SELECT e.id, e.character_id, e.company_id, c.status AS company_status, c.name AS company_name, e.job_id, e.salary_minor,
                COALESCE(NULLIF(to_jsonb(e)->>'salary_arrears_minor','')::bigint, 0)::text AS salary_arrears_minor,
                NULLIF(to_jsonb(e)->>'last_salary_period_key','') AS last_salary_period_key,
                NULLIF(to_jsonb(e)->>'effective_resign_game_year','')::int AS effective_resign_game_year,
                NULLIF(to_jsonb(e)->>'effective_resign_game_day','')::int AS effective_resign_game_day,
                COALESCE((to_jsonb(e)->>'is_owner_role')::boolean, false) AS is_owner_role
         FROM employments e
         LEFT JOIN companies c ON c.id = e.company_id
         WHERE e.status = 'notice_pending'
           AND NULLIF(to_jsonb(e)->>'effective_resign_game_year','') IS NOT NULL
           AND NULLIF(to_jsonb(e)->>'effective_resign_game_day','') IS NOT NULL
           AND ((NULLIF(to_jsonb(e)->>'effective_resign_game_year','')::int * ${GAME_DAYS_PER_YEAR})
                + NULLIF(to_jsonb(e)->>'effective_resign_game_day','')::int) <= $1
         FOR UPDATE OF e`,
        [currentAbs],
      );

      let finalized = 0;
      let proratedPaid = 0;
      for (const emp of pendingResigns.rows) {
        const effYear = Number(emp.effective_resign_game_year ?? nextYear);
        const effDayOfYear = Number(emp.effective_resign_game_day ?? nextDay);
        const effMonth = Math.floor(effDayOfYear / 30) + 1;
        const effDayOfMonth = (effDayOfYear % 30) + 1; // 1..30
        const effPeriodKey = `${effYear}-${String(effMonth).padStart(2, '0')}`;
        const monthlySalary = Math.max(0, Number(emp.salary_minor ?? 0));
        const daysWorkedInCurrentMonth = Math.max(1, Math.min(30, effDayOfMonth));
        const shouldPayProrated = emp.last_salary_period_key !== effPeriodKey;
        const proratedSalary = shouldPayProrated
          ? Math.round((monthlySalary / 30) * daysWorkedInCurrentMonth)
          : 0;

        try {
          if (proratedSalary > 0) {
            const canPayFromCompany =
              !!emp.company_id && (emp.company_status === 'active' || emp.company_status === 'ipo');

            if (canPayFromCompany && emp.company_id) {
              const companyRes = await client.query<{ cash_minor: string; status: string; name: string }>(
                `SELECT cash_minor, status, name FROM companies WHERE id = $1 FOR UPDATE`,
                [emp.company_id],
              );
              const company = companyRes.rows[0];
              if (company && ['active', 'ipo'].includes(company.status)) {
                const companyCash = Math.max(0, Number(company.cash_minor ?? 0));
                const payAmount = Math.min(proratedSalary, companyCash);
                if (payAmount > 0) {
                  await postLedger(client, {
                    kind: 'salary_income',
                    description: 'Lương thôi việc tính theo tỷ lệ số ngày làm việc',
                    referenceType: 'employment',
                    referenceId: emp.id,
                    legs: [
                      { ownerType: 'company', ownerId: emp.company_id, kind: 'cash', deltaMinor: -payAmount },
                      { ownerType: 'character', ownerId: emp.character_id, kind: 'cash', deltaMinor: payAmount },
                    ],
                  });
                  await client.query(
                    `INSERT INTO company_ledger_entries
                       (id, company_id, entry_type, amount_minor, declared_amount_minor, description, is_evasion, meta, ledger_kind, period_key)
                     VALUES (gen_random_uuid(), $1, 'payroll', $2::bigint, $2::bigint, $3, false, $4::jsonb, 'ACTUAL', $5)`,
                    [
                      emp.company_id,
                      payAmount,
                      'Lương thôi việc tính theo tỷ lệ số ngày làm việc',
                      JSON.stringify({
                        source: 'employment_resignation_prorated',
                        employmentId: emp.id,
                        characterId: emp.character_id,
                        monthlySalaryMinor: monthlySalary,
                        daysWorkedInCurrentMonth,
                        proratedSalaryMinor: proratedSalary,
                        paidMinor: payAmount,
                        effectiveGameYear: effYear,
                        effectiveGameDayOfYear: effDayOfYear,
                      }),
                      effPeriodKey,
                    ],
                  );
                  await enqueueDomainEvent(client, {
                    type: 'character.income.v1',
                    aggregateType: 'character',
                    aggregateId: emp.character_id,
                    payload: {
                      characterId: emp.character_id,
                      amountMinor: payAmount,
                      kind: 'salary',
                      at: now.toISOString(),
                    },
                  });
                  await applyImmediateChildSupportFromIncome(client, emp.character_id, payAmount, effPeriodKey);
                  await deductHealthInsuranceFromSalary(client, emp.character_id, payAmount, effPeriodKey, now.toISOString());
                  proratedPaid += 1;
                }
              }
            } else {
              await postLedger(client, {
                kind: 'salary_income',
                description: 'Lương thôi việc tính theo tỷ lệ số ngày làm việc',
                referenceType: 'employment',
                referenceId: emp.id,
                legs: [
                  { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: -proratedSalary },
                  { ownerType: 'character', ownerId: emp.character_id, kind: 'cash', deltaMinor: proratedSalary },
                ],
              });
              await enqueueDomainEvent(client, {
                type: 'character.income.v1',
                aggregateType: 'character',
                aggregateId: emp.character_id,
                payload: {
                  characterId: emp.character_id,
                  amountMinor: proratedSalary,
                  kind: 'salary',
                  at: now.toISOString(),
                },
              });
              await applyImmediateChildSupportFromIncome(client, emp.character_id, proratedSalary, effPeriodKey);
              await deductHealthInsuranceFromSalary(client, emp.character_id, proratedSalary, effPeriodKey, now.toISOString());
              proratedPaid += 1;
            }
          }

          await client.query(
            `UPDATE employments
                SET status = 'resigned',
                    ended_at = COALESCE(ended_at, now()),
                    last_salary_period_key = $2
              WHERE id = $1`,
            [emp.id, effPeriodKey],
          );
          await client.query(`UPDATE jobs SET openings = openings + 1 WHERE id = $1`, [emp.job_id]);
          finalized += 1;
        } catch (e) {
          logger.warn({ err: e, employmentId: emp.id, characterId: emp.character_id }, 'Failed to finalize employment resignation');
        }
      }

      if (pendingResigns.rows.length > 0 || finalized > 0) {
        applied.push(`resignations: ${finalized}/${pendingResigns.rows.length} finalized, prorated-paid=${proratedPaid}`);
      }
    } catch (e) {
      logger.warn({ err: e }, 'Failed to process employment resignations');
      applied.push('resignations: skipped (error)');
    }

    // ---- 3. Salary income from active employments (player employees) ----
    // Tất cả lương trả theo tháng (game): chỉ xử lý vào ngày đầu mỗi tháng game (day === 1).
    // Phase 1: việc làm gắn công ty được trả từ quỹ công ty (tính chi phí payroll), có hỗ trợ nợ lương (arrears).
    // Việc làm không gắn công ty (hệ thống) vẫn do government chi trả để giữ tương thích.
    const gameMonth = nextTime.month;
    const periodKey = `${nextTime.year}-${String(gameMonth).padStart(2, '0')}`;
    const isSalaryPayday = nextTime.day === 1;

    let salariesPaid = 0;
    let payrollArrearsAccrued = 0;
    if (isSalaryPayday) {
    const employments = await client.query<{
      id: string;
      character_id: string;
      company_id: string | null;
      company_status: string | null;
      company_name: string | null;
      salary_minor: string;
      salary_arrears_minor: string;
      last_salary_period_key: string | null;
      is_owner_role: boolean;
      status: string;
    }>(
      `SELECT e.id, e.character_id, e.company_id, c.status AS company_status, c.name AS company_name, e.salary_minor,
              COALESCE(NULLIF(to_jsonb(e)->>'salary_arrears_minor','')::bigint, 0)::text AS salary_arrears_minor,
              NULLIF(to_jsonb(e)->>'last_salary_period_key','') AS last_salary_period_key,
              COALESCE((to_jsonb(e)->>'is_owner_role')::boolean, false) AS is_owner_role,
              e.status
       FROM employments e
       LEFT JOIN companies c ON c.id = e.company_id
       WHERE e.status IN ('active','notice_pending')`,
    );
    for (const emp of employments.rows) {
      // Thu nhập từ việc làm chịu hiệu ứng năng suất của mùa (seasonEffects.productivityPct)
      const salaryDue = Math.max(0, Math.round(Number(emp.salary_minor) * seasonEffects.productivity));
      const arrearsBefore = Math.max(0, Number(emp.salary_arrears_minor ?? 0));
      const totalOwed = salaryDue + arrearsBefore;
      if (totalOwed <= 0) continue;

      // Lương chủ DN theo mô hình đa-công-ty được xử lý riêng ở bước 3b (không phụ thuộc employment slot).
      if (emp.is_owner_role) continue;

      // Kỳ lương tháng này đã xử lý (tránh trả trùng khi có prorate thôi việc)
      if (emp.last_salary_period_key === periodKey) continue;

      try {
        const canPayFromCompany =
          !!emp.company_id &&
          (emp.company_status === 'active' || emp.company_status === 'ipo');

        if (canPayFromCompany && emp.company_id) {
          const companyRes = await client.query<{ cash_minor: string; status: string; name: string }>(
            `SELECT cash_minor, status, name FROM companies WHERE id = $1 FOR UPDATE`,
            [emp.company_id],
          );
          const company = companyRes.rows[0];
          if (!company || !['active', 'ipo'].includes(company.status)) {
            // Công ty không còn hợp lệ để chi trả: chuyển nợ lương (nếu có) và bỏ qua kỳ
            if (salaryDue > 0) {
              await client.query(
                `UPDATE employments
                    SET salary_arrears_minor = COALESCE(NULLIF(to_jsonb(employments)->>'salary_arrears_minor','')::bigint, 0) + $2::bigint,
                        last_salary_period_key = $3
                  WHERE id = $1`,
                [emp.id, salaryDue, periodKey],
              ).catch(() => {});
              payrollArrearsAccrued += 1;
            } else {
              await client.query(
                `UPDATE employments SET last_salary_period_key = $2 WHERE id = $1`,
                [emp.id, periodKey],
              ).catch(() => {});
            }
            continue;
          }

          const companyCash = Math.max(0, Number(company.cash_minor ?? 0));
          const payAmount = Math.min(totalOwed, companyCash);
          const arrearsAfter = totalOwed - payAmount;

          if (payAmount > 0) {
            await postLedger(client, {
              kind: 'salary_income',
              description: `Nhận lương (${company.name})`,
              referenceType: 'employment',
              referenceId: emp.id,
              legs: [
                { ownerType: 'company', ownerId: emp.company_id, kind: 'cash', deltaMinor: -payAmount },
                { ownerType: 'character', ownerId: emp.character_id, kind: 'cash', deltaMinor: payAmount },
              ],
            });

            await client.query(
              `INSERT INTO company_ledger_entries
                 (id, company_id, entry_type, amount_minor, declared_amount_minor, description, is_evasion, meta, ledger_kind, period_key)
               VALUES (gen_random_uuid(), $1, 'payroll', $2::bigint, $2::bigint, $3, false, $4::jsonb, 'ACTUAL', $5)`,
              [
                emp.company_id,
                payAmount,
                arrearsBefore > 0 || arrearsAfter > 0
                  ? 'Chi lương nhân viên (bao gồm xử lý nợ lương, tự động)'
                  : 'Chi lương nhân viên (tự động)',
                JSON.stringify({
                  source: 'employment_payroll',
                  employmentId: emp.id,
                  characterId: emp.character_id,
                  dueMinor: salaryDue,
                  arrearsBefore,
                  arrearsAfter,
                }),
                periodKey,
              ],
            );

            await enqueueDomainEvent(client, {
              type: 'character.income.v1',
              aggregateType: 'character',
              aggregateId: emp.character_id,
              payload: {
                characterId: emp.character_id,
                amountMinor: payAmount,
                kind: 'salary',
                at: now.toISOString(),
              },
            });
            await applyImmediateChildSupportFromIncome(client, emp.character_id, payAmount, periodKey);
            await deductHealthInsuranceFromSalary(client, emp.character_id, payAmount, periodKey, now.toISOString());

            salariesPaid += 1;
          }

          if (arrearsAfter !== arrearsBefore || (arrearsAfter > 0 && payAmount === 0)) {
            await client.query(
              `UPDATE employments
                  SET salary_arrears_minor = $2::bigint,
                      last_salary_period_key = $3
                WHERE id = $1`,
              [emp.id, arrearsAfter, periodKey],
            ).catch(() => {});
            if (arrearsAfter > arrearsBefore) payrollArrearsAccrued += 1;
          } else if (arrearsAfter !== arrearsBefore) {
            await client.query(
              `UPDATE employments SET salary_arrears_minor = $2::bigint, last_salary_period_key = $3 WHERE id = $1`,
              [emp.id, arrearsAfter, periodKey],
            ).catch(() => {});
          } else {
            await client.query(
              `UPDATE employments SET last_salary_period_key = $2 WHERE id = $1`,
              [emp.id, periodKey],
            ).catch(() => {});
          }

          continue;
        }

        // Fallback tương thích: việc làm không gắn công ty (hệ thống) do government chi trả
        const payAmount = salaryDue;
        if (payAmount <= 0) {
          await client.query(`UPDATE employments SET last_salary_period_key = $2 WHERE id = $1`, [emp.id, periodKey]).catch(() => {});
          continue;
        }
        await postLedger(client, {
          kind: 'salary_income',
          description: 'Nhận lương',
          referenceType: 'employment',
          referenceId: emp.character_id,
          legs: [
            { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: -payAmount },
            { ownerType: 'character', ownerId: emp.character_id, kind: 'cash', deltaMinor: payAmount },
          ],
        });

        await client.query(`UPDATE employments SET last_salary_period_key = $2 WHERE id = $1`, [emp.id, periodKey]).catch(() => {});
        salariesPaid += 1;

        await enqueueDomainEvent(client, {
          type: 'character.income.v1',
          aggregateType: 'character',
          aggregateId: emp.character_id,
          payload: {
            characterId: emp.character_id,
            amountMinor: payAmount,
            kind: 'salary',
            at: now.toISOString(),
          },
        });
        await applyImmediateChildSupportFromIncome(client, emp.character_id, payAmount, periodKey);
        await deductHealthInsuranceFromSalary(client, emp.character_id, payAmount, periodKey, now.toISOString());
      } catch (e) {
        logger.warn({ err: e, characterId: emp.character_id, employmentId: emp.id }, 'Failed to pay salary');
      }
    }
    applied.push(`employments: ${salariesPaid}/${employments.rows.length} paid, arrears-updated=${payrollArrearsAccrued} (owner-role handled separately)`);
    } else {
      applied.push('employments payroll: skipped (monthly payday only, day=1)');
    }

    // ---- 3c. AI staff payroll (company_staff) - paid from company fund as payroll expense ----
    if (isSalaryPayday) {
    try {
      const staffRows = await client.query<{
        id: string;
        company_id: string;
        company_status: string;
        company_name: string;
        salary_minor: string;
        salary_arrears_minor: string;
      }>(
        `SELECT s.id, s.company_id, c.status AS company_status, c.name AS company_name, s.salary_minor,
                COALESCE(NULLIF(to_jsonb(s)->>'salary_arrears_minor','')::bigint, 0)::text AS salary_arrears_minor
         FROM company_staff s
         JOIN companies c ON c.id = s.company_id
         WHERE s.status = 'active'`,
      );

      let staffPaid = 0;
      let staffArrearsAccrued = 0;
      for (const st of staffRows.rows) {
        const salaryDue = Math.max(0, Math.round(Number(st.salary_minor) * seasonEffects.productivity));
        const arrearsBefore = Math.max(0, Number(st.salary_arrears_minor ?? 0));
        const totalOwed = salaryDue + arrearsBefore;
        if (totalOwed <= 0) continue;

        try {
          if (!['active', 'ipo'].includes(st.company_status)) {
            if (salaryDue > 0) {
              await client.query(
                `UPDATE company_staff
                    SET salary_arrears_minor = COALESCE(NULLIF(to_jsonb(company_staff)->>'salary_arrears_minor','')::bigint, 0) + $2::bigint
                  WHERE id = $1`,
                [st.id, salaryDue],
              ).catch(() => {});
              staffArrearsAccrued += 1;
            }
            continue;
          }

          const companyRes = await client.query<{ cash_minor: string; status: string }>(
            `SELECT cash_minor, status FROM companies WHERE id = $1 FOR UPDATE`,
            [st.company_id],
          );
          const company = companyRes.rows[0];
          if (!company || !['active', 'ipo'].includes(company.status)) continue;

          const companyCash = Math.max(0, Number(company.cash_minor ?? 0));
          const payAmount = Math.min(totalOwed, companyCash);
          const arrearsAfter = totalOwed - payAmount;

          if (payAmount > 0) {
            // Nhân sự AI (NPC) không có ví nhân vật: chi từ quỹ công ty như chi phí payroll (sink hệ thống)
            await postLedger(client, {
              kind: 'staff_payroll_expense',
              description: `Chi lương nhân sự AI (${st.company_name})`,
              referenceType: 'company_staff',
              referenceId: st.id,
              legs: [
                { ownerType: 'company', ownerId: st.company_id, kind: 'cash', deltaMinor: -payAmount },
                { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: payAmount },
              ],
            });

            await client.query(
              `INSERT INTO company_ledger_entries
                 (id, company_id, entry_type, amount_minor, declared_amount_minor, description, is_evasion, meta, ledger_kind, period_key)
               VALUES (gen_random_uuid(), $1, 'payroll', $2::bigint, $2::bigint, $3, false, $4::jsonb, 'ACTUAL', $5)`,
              [
                st.company_id,
                payAmount,
                arrearsBefore > 0 || arrearsAfter > 0
                  ? 'Chi lương nhân sự AI (bao gồm xử lý nợ lương, tự động)'
                  : 'Chi lương nhân sự AI (tự động)',
                JSON.stringify({
                  source: 'company_staff_payroll',
                  staffId: st.id,
                  dueMinor: salaryDue,
                  arrearsBefore,
                  arrearsAfter,
                }),
                periodKey,
              ],
            );

            staffPaid += 1;
          }

          if (arrearsAfter !== arrearsBefore || (arrearsAfter > 0 && payAmount === 0)) {
            await client.query(
              `UPDATE company_staff
                  SET salary_arrears_minor = $2::bigint
                WHERE id = $1`,
              [st.id, arrearsAfter],
            ).catch(() => {});
            if (arrearsAfter > arrearsBefore) staffArrearsAccrued += 1;
          } else if (arrearsAfter !== arrearsBefore) {
            await client.query(
              `UPDATE company_staff SET salary_arrears_minor = $2::bigint WHERE id = $1`,
              [st.id, arrearsAfter],
            ).catch(() => {});
          }
        } catch (e) {
          logger.warn({ err: e, staffId: st.id, companyId: st.company_id }, 'Failed to pay AI staff salary');
        }
      }

      applied.push(`ai_staff_payroll: ${staffPaid}/${staffRows.rows.length} paid, arrears-updated=${staffArrearsAccrued}`);
    } catch (e) {
      logger.warn({ err: e }, 'Failed to process AI staff payroll');
      applied.push('ai_staff_payroll: skipped (error)');
    }
    } else {
      applied.push('ai_staff_payroll: skipped (monthly payday only, day=1)');
    }

    // ---- 3b. Owner salary from companies (multi-company, independent of employment slot) ----
    if (isSalaryPayday) {
    try {
      const ownerSalaryCompanies = await client.query<{
        id: string;
        owner_character_id: string;
        owner_salary_minor: string;
        cash_minor: string;
        name: string;
      }>(
        `SELECT c.id, c.owner_character_id,
                COALESCE(NULLIF(to_jsonb(c)->>'owner_salary_minor','')::bigint, 0)::text AS owner_salary_minor,
                c.cash_minor, c.name
         FROM companies c
         JOIN characters ch ON ch.id = c.owner_character_id
         WHERE c.status IN ('active','ipo')
           AND COALESCE(ch.is_alive, true) = true
           AND COALESCE(NULLIF(to_jsonb(c)->>'owner_salary_minor','')::bigint, 0) > 0`,
      );

      let ownerSalariesPaid = 0;
      for (const co of ownerSalaryCompanies.rows) {
        const base = Math.max(0, Number(co.owner_salary_minor ?? 0));
        const salary = Math.max(0, Math.round(base * seasonEffects.productivity));
        if (salary <= 0) continue;

        try {
          const locked = await client.query<{ cash_minor: string; status: string }>(
            `SELECT cash_minor, status FROM companies WHERE id = $1 FOR UPDATE`,
            [co.id],
          );
          const company = locked.rows[0];
          if (!company || !['active', 'ipo'].includes(company.status)) continue;
          if (Number(company.cash_minor ?? 0) < salary) continue;

          await postLedger(client, {
            kind: 'owner_salary_income',
            description: `Nhận lương chủ doanh nghiệp (${co.name})`,
            referenceType: 'company',
            referenceId: co.id,
            legs: [
              { ownerType: 'company', ownerId: co.id, kind: 'cash', deltaMinor: -salary },
              { ownerType: 'character', ownerId: co.owner_character_id, kind: 'cash', deltaMinor: salary },
            ],
          });

          await client.query(
            `INSERT INTO company_ledger_entries
               (id, company_id, entry_type, amount_minor, declared_amount_minor, description, is_evasion, meta, ledger_kind, period_key)
             VALUES (gen_random_uuid(), $1, 'payroll', $2::bigint, $2::bigint, $3, false, $4::jsonb, 'ACTUAL', $5)`,
            [
              co.id,
              salary,
              'Lương chủ doanh nghiệp (tự động)',
              JSON.stringify({ source: 'owner_salary', characterId: co.owner_character_id }),
              periodKey,
            ],
          );

          ownerSalariesPaid += 1;

          await enqueueDomainEvent(client, {
            type: 'character.income.v1',
            aggregateType: 'character',
            aggregateId: co.owner_character_id,
            payload: {
              characterId: co.owner_character_id,
              amountMinor: salary,
              kind: 'salary',
              at: now.toISOString(),
            },
          });
          await applyImmediateChildSupportFromIncome(client, co.owner_character_id, salary, periodKey);
          await deductHealthInsuranceFromSalary(client, co.owner_character_id, salary, periodKey, now.toISOString());
        } catch (e) {
          logger.warn({ err: e, companyId: co.id, characterId: co.owner_character_id }, 'Failed to pay owner salary');
        }
      }
      applied.push(`owner_salaries: ${ownerSalariesPaid}/${ownerSalaryCompanies.rows.length} paid`);
    } catch (e) {
      logger.warn({ err: e }, 'Failed to process owner company salaries');
      applied.push('owner_salaries: skipped (error)');
    }
    } else {
      applied.push('owner_salaries: skipped (monthly payday only, day=1)');
    }

    // ---- 4. Rent collection ----
    // Chuẩn thời gian: 1 tháng game = 30 ngày game = 30 phút thực
    const leases = await client.query<{
      id: string;
      property_id: string;
      tenant_character_id: string;
      monthly_rent_minor: string;
      next_due_at: Date;
    }>(
      `SELECT id, property_id, tenant_character_id, monthly_rent_minor, next_due_at FROM leases WHERE status = 'active'`,
    );

    let rentsCollected = 0;
    for (const lease of leases.rows) {
      const rent = Number(lease.monthly_rent_minor);
      if (rent <= 0) continue;
      if (lease.next_due_at > now) continue;

      const property = await client.query<{
        owner_character_id: string | null;
      }>(`SELECT owner_character_id FROM properties WHERE id = $1`, [lease.property_id]);

      const ownerId = property.rows[0]?.owner_character_id ?? null;
      if (!ownerId || ownerId === lease.tenant_character_id) {
        await client.query(
          `UPDATE leases SET next_due_at = next_due_at + interval '30 minutes', updated_at = now() WHERE id = $1`,
          [lease.id],
        );
        continue;
      }

      const tenantCashRes = await client.query<{ cash_minor: string }>(
        `SELECT cash_minor FROM characters WHERE id = $1 FOR UPDATE`,
        [lease.tenant_character_id],
      );
      const tenantCash = Number(tenantCashRes.rows[0]?.cash_minor ?? 0);
      if (tenantCash < rent) {
        // Không đủ tiền thuê: chưa thu, chưa ghi lịch sử giao dịch; giữ hạn để xử lý khi có tiền
        continue;
      }

      try {
        await postLedger(client, {
          kind: 'rent_payment',
          description: 'Thanh toán tiền thuê',
          referenceType: 'lease',
          referenceId: lease.id,
          legs: [
            { ownerType: 'character', ownerId: lease.tenant_character_id, kind: 'cash', deltaMinor: -rent },
            { ownerType: 'character', ownerId: ownerId, kind: 'cash', deltaMinor: rent },
          ],
        });

        await client.query(
          `UPDATE leases SET next_due_at = next_due_at + interval '30 minutes', updated_at = now() WHERE id = $1`,
          [lease.id],
        );
        rentsCollected += 1;

        await enqueueDomainEvent(client, {
          type: 'property.rent.v1',
          aggregateType: 'lease',
          aggregateId: lease.id,
          payload: {
            leaseId: lease.id,
            propertyId: lease.property_id,
            tenantId: lease.tenant_character_id,
            ownerId,
            amountMinor: rent,
            at: now.toISOString(),
          },
        });
      } catch (e) {
        logger.warn({ err: e, leaseId: lease.id }, 'Failed to collect rent');
      }
    }
    applied.push(`leases: ${rentsCollected}/${leases.rows.length} rent collected`);

    // ---- 5. Loan interest + default/foreclosure ----
    // 1 tháng game = 30 ngày game (30 phút thực) cho kỳ hạn/lãi; ân hạn mặc định 30 ngày game
    const loans = await client.query<{
      id: string;
      borrower_id: string;
      outstanding_minor: string;
      interest_rate_pct: string;
      next_due_at: Date;
      grace_period_end: Date;
      status: string;
    }>(
      `SELECT id, borrower_id, outstanding_minor, interest_rate_pct, next_due_at, grace_period_end, status FROM loans WHERE status IN ('active', 'grace', 'defaulted')`,
    );

    for (const loan of loans.rows) {
      const outstanding = Number(loan.outstanding_minor);
      if (outstanding <= 0) continue;

      const rate = Number(loan.interest_rate_pct);

      const health = evaluateLoanHealth({
        outstandingMinor: outstanding,
        gracePeriodEnd: loan.grace_period_end,
        now,
        bankGraceDays: 30,
      });

      // Accrue interest if active/grace and due date passed (mỗi 30 ngày game)
      if (loan.status !== 'defaulted' && loan.next_due_at <= now) {
        const interest = accrueSimpleInterest({
          principalMinor: outstanding,
          annualRatePct: rate,
          days: 30,
        });
        if (interest > 0) {
          await client.query(
            `UPDATE loans SET outstanding_minor = outstanding_minor + $1, updated_at = now() WHERE id = $2`,
            [interest, loan.id],
          );
          await enqueueDomainEvent(client, {
            type: 'loan.interest.v1',
            aggregateType: 'loan',
            aggregateId: loan.id,
            payload: {
              loanId: loan.id,
              borrowerId: loan.borrower_id,
              interestMinor: interest,
              at: now.toISOString(),
            },
          });
        }

        await client.query(
          `UPDATE loans SET next_due_at = next_due_at + interval '30 minutes' WHERE id = $1`,
          [loan.id],
        );
      }

      // Status progression: map domain health -> DB status
      let newStatus: string;
      switch (health) {
        case 'current':
          newStatus = 'active';
          break;
        case 'grace':
          newStatus = 'grace';
          break;
        case 'default':
          newStatus = 'defaulted';
          break;
        case 'foreclose':
          newStatus = 'foreclosed';
          break;
        default:
          newStatus = loan.status;
      }

      if (newStatus !== loan.status) {
        await client.query(`UPDATE loans SET status = $1, updated_at = now() WHERE id = $2`, [
          newStatus,
          loan.id,
        ]);
        applied.push(`loan ${loan.id}: ${loan.status} → ${newStatus}`);

        if (newStatus === 'foreclosed') {
          await enqueueDomainEvent(client, {
            type: 'loan.foreclosed.v1',
            aggregateType: 'loan',
            aggregateId: loan.id,
            payload: { loanId: loan.id, borrowerId: loan.borrower_id, at: now.toISOString() },
          });
        } else if (newStatus === 'defaulted') {
          await enqueueDomainEvent(client, {
            type: 'loan.defaulted.v1',
            aggregateType: 'loan',
            aggregateId: loan.id,
            payload: { loanId: loan.id, borrowerId: loan.borrower_id, at: now.toISOString() },
          });
        }
      }
    }
    applied.push(`loans: ${loans.rows.length} interest/default checked`);


    // ---- 8. Death check (health <= 0, đạt tuổi thọ tối đa do admin cấu hình, hoặc rủi ro tuổi cao) ----
    const deathCandidates = await client.query<{ id: string; user_id: string | null; age: number; health_energy: number; death_age: number | null; birth_game_year: number | null; birth_game_day: number | null; is_alive: boolean }>(
      `SELECT id, user_id, age, health_energy, death_age, birth_game_year, birth_game_day, COALESCE(is_alive,true) as is_alive FROM characters WHERE COALESCE(is_alive,true)=true`,
    );
    for (const ch of deathCandidates.rows) {
      let reason: string | null = null;
      const effectiveAge =
        ch.birth_game_year != null && ch.birth_game_day != null
          ? computeGameAge({
              birthYear: Number(ch.birth_game_year),
              birthDayOfYear: Number(ch.birth_game_day),
              currentYear: nextYear,
              currentDayOfYear: nextDay,
            })
          : Number(ch.age);
      if (Number(ch.health_energy) <= 0) reason = 'Sức khỏe cạn kiệt';
      else if ((ch.death_age != null ? Number(ch.death_age) : 80) <= effectiveAge) reason = 'Đạt tuổi thọ tối đa (do quản trị cấu hình)';
      else if (effectiveAge >= 65) {
        const pDeath = Math.min(0.95, Math.pow(1.12, effectiveAge - 65) * 0.02);
        if (Math.random() < pDeath) reason = 'Tuổi cao đột tử';
      }
      if (!reason) continue;
      const locked = await client.query<{ id: string; is_alive: boolean }>(
        `SELECT id, COALESCE(is_alive,true) as is_alive FROM characters WHERE id = $1 FOR UPDATE`,
        [ch.id],
      );
      if (!locked.rows[0] || locked.rows[0].is_alive === false) continue;
      await client.query(
        `UPDATE characters SET is_alive = false, health_energy = 0, updated_at = now() WHERE id = $1`,
        [ch.id],
      );
      // Gỡ trạng thái rao bán/cho thuê và hủy đề nghị mua bán đang chờ của nhân vật đã chết
      // để tránh BĐS hiển thị "đang đăng bán" khi chủ sở hữu đã qua đời (trước khi kế thừa/giải quyết di sản).
      await client.query(
        `UPDATE properties
         SET status = CASE WHEN status = 'listed' THEN 'owned' ELSE status END,
             asking_price_minor = NULL,
             sale_notes = NULL,
             rent_listing_active = false,
             updated_at = now()
         WHERE owner_character_id = $1
           AND (status = 'listed' OR asking_price_minor IS NOT NULL OR sale_notes IS NOT NULL OR rent_listing_active = true)`,
        [ch.id],
      );
      await client.query(
        `UPDATE property_sale_offers
         SET status = 'cancelled', resolved_at = now(), updated_at = now()
         WHERE status = 'pending' AND (seller_character_id = $1 OR buyer_character_id = $1)`,
        [ch.id],
      );
      if (ch.user_id) {
        await enqueueDomainEvent(client, {
          type: 'character.died',
          aggregateType: 'character',
          aggregateId: ch.id,
          payload: {
            characterId: ch.id,
            userId: ch.user_id,
            reason,
          },
        });
        await client.query(
          `INSERT INTO notifications (id, user_id, kind, title, body, payload)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb)`,
          [
            ch.user_id,
            'system',
            'Nhân vật đã qua đời',
            `Nhân vật của bạn đã qua đời (${reason}). Vui lòng chọn người kế thừa để bắt đầu cuộc đời mới.`,
            JSON.stringify({ characterId: ch.id, reason }),
          ],
        );
      }
      applied.push(`death:${ch.id}:${reason}`);
    }

    // ---- 9. Mayor term expiry & salary (Pha A/C, best-effort) ----
    // Dùng SAVEPOINT: nếu bước best-effort lỗi thì chỉ rollback phần này, không làm hỏng transaction tick.
    await client.query('SAVEPOINT mayor_step');
    try {
      const macroRes = await client.query<{ macro: any }>(`SELECT macro FROM game_state WHERE id = 1`);
      const macro = (macroRes.rows[0]?.macro && typeof macroRes.rows[0].macro === 'object') ? macroRes.rows[0].macro : {};
      const mayorCfg = (macro as any).mayor && typeof (macro as any).mayor === 'object' ? (macro as any).mayor : {};
      const mayorEnabled = mayorCfg.enabled !== false;
      if (mayorEnabled) {
        // expire overdue active terms (real-time end)
        const expiredRes = await client.query<{ id: string }>(
          `UPDATE elections
           SET term_status = 'expired'
           WHERE term_status = 'active' AND term_ends_at IS NOT NULL AND term_ends_at <= now()
           RETURNING id`,
        );
        if (expiredRes.rows.length > 0) {
          for (const e of expiredRes.rows) {
            await client.query(
              `INSERT INTO mayor_actions (id, election_id, action_type, status, reason, payload)
               VALUES (gen_random_uuid(), $1, 'term_expired', 'applied', 'Hết hạn nhiệm kỳ (tick)', '{}'::jsonb)`,
              [e.id],
            );
          }
          applied.push(`mayor: ${expiredRes.rows.length} term(s) expired`);
        }

        // salary payout for active mayor (per in-game day, idempotent)
        const salaryMinor = Math.max(0, Math.round(Number(mayorCfg.salaryMinor ?? 0)));
        const intervalDays = Math.max(1, Math.round(Number(mayorCfg.salaryIntervalGameDays ?? 1)));
        if (salaryMinor > 0) {
          const activeMayor = await client.query<{
            id: string; winner_character_id: string | null; salary_last_game_day: number | null; salary_last_game_year: number | null;
          }>(
            `SELECT id, winner_character_id, salary_last_game_day, salary_last_game_year
             FROM elections
             WHERE term_status = 'active' AND revoked_at IS NULL AND winner_character_id IS NOT NULL
               AND (term_ends_at IS NULL OR term_ends_at > now())
             ORDER BY term_started_at DESC NULLS LAST, created_at DESC
             LIMIT 1
             FOR UPDATE`,
          );
          const term = activeMayor.rows[0];
          if (term?.winner_character_id) {
            const lastDay = term.salary_last_game_day == null ? null : Number(term.salary_last_game_day);
            const lastYear = term.salary_last_game_year == null ? null : Number(term.salary_last_game_year);
            const due = (lastDay === null || lastYear === null)
              ? true
              : (nextYear > lastYear || (nextYear === lastYear && (nextDay - lastDay) >= intervalDays));
            if (due) {
              const alive = await client.query<{ id: string }>(
                `SELECT id FROM characters WHERE id = $1 AND COALESCE(is_alive,true)=true FOR UPDATE`,
                [term.winner_character_id],
              );
              if (alive.rows[0]) {
                // credit via ledger (government -> character) so history/balances stay consistent
                await postLedger(client, {
                  kind: 'mayor_salary',
                  description: 'Phụ cấp Thị trưởng',
                  referenceType: 'election',
                  referenceId: term.id,
                  legs: [
                    { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: -salaryMinor },
                    { ownerType: 'character', ownerId: term.winner_character_id, kind: 'cash', deltaMinor: salaryMinor },
                  ],
                });
                await client.query(
                  `UPDATE elections SET salary_last_game_day = $2, salary_last_game_year = $3 WHERE id = $1`,
                  [term.id, nextDay, nextYear],
                );
                await client.query(
                  `INSERT INTO mayor_actions (id, election_id, actor_character_id, action_type, status, amount_minor, reason, payload)
                   VALUES (gen_random_uuid(), $1, $2, 'salary_payout', 'applied', $3, 'Phụ cấp định kỳ', $4::jsonb)`,
                  [term.id, term.winner_character_id, salaryMinor, JSON.stringify({ gameDay: nextDay, gameYear: nextYear })],
                );
                await enqueueDomainEvent(client, {
                  type: 'mayor.salary.v1',
                  aggregateType: 'election',
                  aggregateId: term.id,
                  payload: { electionId: term.id, characterId: term.winner_character_id, amountMinor: salaryMinor, gameDay: nextDay, gameYear: nextYear },
                });
                applied.push(`mayor: salary paid ${salaryMinor} to ${term.winner_character_id}`);
              }
            }
          }
        }
      }
    } catch (e) {
      try {
        await client.query('ROLLBACK TO SAVEPOINT mayor_step');
      } catch {
        /* ignore */
      }
      logger.warn({ err: e }, 'Mayor term/salary tick step failed (best-effort)');
    }

    // ---- 8. Company auto revenue settlement (monthly, catch-up for recent completed periods) ----
    await client.query('SAVEPOINT company_settlement_step');
    try {
      const completedPeriods: Array<{ periodKey: string; gameYear: number; gameMonth: number }> = [];
      // Đồng bộ theo thời gian hệ thống (game_state): bù tối đa 48 kỳ tháng game đã hoàn tất để không lệch thời gian/kỳ.
      for (let i = 1; i <= 48; i++) {
        let m = nextTime.month - i;
        let y = nextYear;
        while (m <= 0) {
          m += 12;
          y -= 1;
        }
        completedPeriods.push({ periodKey: `${y}-${String(m).padStart(2, '0')}`, gameYear: y, gameMonth: m });
      }

      const cfgRes = await client.query<{
        industry_type: string;
        monthly_rate_pct: string;
        min_revenue_minor: string;
        max_revenue_minor: string;
      }>(`SELECT industry_type, monthly_rate_pct, min_revenue_minor, max_revenue_minor FROM industry_revenue_configs`);
      const cfgMap = new Map(cfgRes.rows.map((r) => [r.industry_type, r]));

      let totalSettled = 0;
      const settledPeriods: string[] = [];
      const revenueMultiplier = Number(seasonEffects.revenue ?? 1);

      for (const period of completedPeriods) {
        const { periodKey, gameYear, gameMonth } = period;
        const companiesRes = await client.query<{
          id: string;
          owner_character_id: string;
          industry: string;
          valuation_minor: string;
          cash_minor: string;
          revenue_retain_pct: string | number;
          founded_game_year: number | null;
          founded_game_month: number | null;
        }>(
          `SELECT c.id, c.owner_character_id, c.industry, c.valuation_minor, c.cash_minor,
                  COALESCE(c.revenue_retain_pct,0) AS revenue_retain_pct,
                  c.founded_game_year, c.founded_game_month
           FROM companies c
           WHERE c.status IN ('active', 'ipo')
             AND EXISTS (SELECT 1 FROM business_licenses bl WHERE bl.company_id = c.id AND bl.status = 'active')
             AND NOT EXISTS (SELECT 1 FROM company_revenue_settlements s WHERE s.company_id = c.id AND s.period_key = $1)`,
          [periodKey],
        );

        let settledForPeriod = 0;
        for (const co of companiesRes.rows) {
          // Không chốt doanh thu/thuế cho các kỳ trước thời điểm thành lập công ty (theo thời gian game).
          if (co.founded_game_year != null && co.founded_game_month != null) {
            if (gameYear < co.founded_game_year || (gameYear === co.founded_game_year && gameMonth < co.founded_game_month)) {
              continue;
            }
          }

          const cfg = cfgMap.get(co.industry);
          if (!cfg) continue;
          const ratePct = Number(cfg.monthly_rate_pct ?? 0);
          if (!Number.isFinite(ratePct) || ratePct <= 0) continue;

          const effectiveVal = await client
            .query<{ v: string }>(`SELECT effective_company_valuation($1::uuid) AS v`, [co.id])
            .then((r) => Number(r.rows[0]?.v ?? 0))
            .catch(() => Math.max(0, Number(co.valuation_minor ?? 0), Number(co.cash_minor ?? 0)));
          const baseCapital = Math.max(0, effectiveVal, Number(co.cash_minor ?? 0));
          let actualRevenue = Math.round(baseCapital * (ratePct / 100) * revenueMultiplier);
          const minRev = Math.max(0, Number(cfg.min_revenue_minor ?? 0));
          const maxRev = Math.max(0, Number(cfg.max_revenue_minor ?? 0));
          if (minRev > 0) actualRevenue = Math.max(actualRevenue, minRev);
          if (maxRev > 0) actualRevenue = Math.min(actualRevenue, maxRev);
          if (!Number.isFinite(actualRevenue) || actualRevenue < 0) actualRevenue = 0;

          try {
            const retainPct = Math.max(0, Math.min(100, Number(co.revenue_retain_pct ?? 0)));
            const retainedMinor =
              actualRevenue > 0 ? Math.min(actualRevenue, Math.max(0, Math.round(actualRevenue * (retainPct / 100)))) : 0;
            const ownerPayoutMinor = Math.max(0, actualRevenue - retainedMinor);

            // 1) Phân bổ doanh thu thực tế (chỉ khi > 0): một phần giữ lại quỹ công ty, phần còn lại về ví chủ sở hữu
            if (ownerPayoutMinor > 0) {
              await postLedger(client, {
                kind: 'COMPANY_REVENUE_PAYOUT',
                description: `Doanh thu tự động kỳ ${periodKey} (trả về chủ sở hữu)`,
                referenceType: 'company_revenue_settlement',
                referenceId: co.id,
                legs: [
                  { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: -ownerPayoutMinor },
                  { ownerType: 'character', ownerId: co.owner_character_id, kind: 'cash', deltaMinor: ownerPayoutMinor },
                ],
              });
            }
            if (retainedMinor > 0) {
              await postLedger(client, {
                kind: 'COMPANY_REVENUE_RETAINED',
                description: `Doanh thu tự động kỳ ${periodKey} (giữ lại quỹ công ty ${retainPct}%)`,
                referenceType: 'company_revenue_settlement',
                referenceId: co.id,
                legs: [
                  { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: -retainedMinor },
                  { ownerType: 'company', ownerId: co.id, kind: 'cash', deltaMinor: retainedMinor },
                ],
              });
            }

            // 2) Bút toán đối chiếu ACTUAL trong sổ cái công ty (ghi nhận tổng doanh thu thực tế của kỳ, kể cả 0)
            await client.query(
              `INSERT INTO company_ledger_entries
                 (company_id, entry_type, amount_minor, declared_amount_minor, description, is_evasion, meta, ledger_kind, period_key)
               VALUES ($1,'revenue',$2,$2,$3,false,$4::jsonb,'ACTUAL',$5)`,
              [
                co.id,
                actualRevenue,
                `Doanh thu thực tế tự động kỳ ${periodKey} (trả chủ sở hữu ${ownerPayoutMinor}, giữ lại quỹ ${retainedMinor}, tỉ lệ giữ ${retainPct}%)`,
                JSON.stringify({
                  source: 'auto_30d',
                  periodKey,
                  baseCapitalMinor: Math.trunc(baseCapital),
                  monthlyRatePct: ratePct,
                  seasonMultiplier: revenueMultiplier,
                  retainPct,
                  retainedMinor,
                  ownerPayoutMinor,
                }),
                periodKey,
              ],
            );

            // 3) Đánh dấu đã chốt kỳ (idempotent) để kỳ xuất hiện trong bảng thống kê doanh thu
            await client.query(
              `INSERT INTO company_revenue_settlements
                 (id, company_id, owner_character_id, period_key, game_year, game_month, base_capital_minor, monthly_rate_pct, season_multiplier, actual_revenue_minor, retained_minor, owner_payout_minor, status)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'settled')
               ON CONFLICT (company_id, period_key) DO NOTHING`,
              [
                co.id,
                co.owner_character_id,
                periodKey,
                gameYear,
                gameMonth,
                Math.trunc(baseCapital),
                ratePct,
                revenueMultiplier,
                actualRevenue,
                retainedMinor,
                ownerPayoutMinor,
              ],
            );

            await enqueueDomainEvent(client, {
              type: 'company.revenue.settled.v1',
              aggregateType: 'company',
              aggregateId: co.id,
              payload: {
                companyId: co.id,
                ownerCharacterId: co.owner_character_id,
                periodKey,
                actualRevenueMinor: actualRevenue,
                retainedMinor,
                ownerPayoutMinor,
                retainPct,
              },
            });
            settledForPeriod += 1;
          } catch (err) {
            logger.warn({ err, companyId: co.id, periodKey }, 'Company auto revenue settlement failed for company');
          }
        }

        if (settledForPeriod > 0) {
          totalSettled += settledForPeriod;
          settledPeriods.push(`${periodKey}:${settledForPeriod}`);
        }
      }

      if (totalSettled > 0) {
        applied.push(`companies: auto revenue settled ${totalSettled} (${settledPeriods.join(', ')})`);
      }
    } catch (e) {
      try {
        await client.query('ROLLBACK TO SAVEPOINT company_settlement_step');
      } catch {
        /* ignore */
      }
      logger.warn({ err: e }, 'Company auto revenue settlement step failed (best-effort)');
    }

    // ---- 8b. Tax filing audit (risk-based) ----
    await client.query('SAVEPOINT audit_step');
    try {
      const filingsRes = await client.query<{
        id: string;
        company_id: string;
        period_key: string | null;
        declared_revenue_minor: string;
        actual_revenue_minor: string;
        tax_due_minor: string;
        risk_score: number;
      }>(
        `SELECT f.id, f.company_id, f.period_key, f.declared_revenue_minor, f.actual_revenue_minor, f.tax_due_minor, f.risk_score
         FROM company_tax_filings f
         JOIN companies c ON c.id = f.company_id
         WHERE f.status = 'filed'
           AND f.audit_checked_at IS NULL
           AND COALESCE(f.evasion_gap_minor, 0) > 0
           AND COALESCE(f.risk_score, 0) > 0
         ORDER BY f.risk_score DESC, f.filed_at ASC NULLS LAST
         LIMIT 20`
      );
      for (const f of filingsRes.rows) {
        const declared = Number(f.declared_revenue_minor ?? 0);
        const actual = Number(f.actual_revenue_minor ?? 0);
        const evasionGap = Math.max(0, actual - declared);
        if (evasionGap <= 0) {
          await client.query(`UPDATE company_tax_filings SET audit_checked_at = now(), status = 'audited' WHERE id = $1`, [f.id]);
          continue;
        }
        const risk = Math.max(0, Math.min(100, Number(f.risk_score ?? 0)));
        // Xác suất bị kiểm tra/phát hiện tăng theo riskScore
        const roll = Math.random() * 100;
        if (roll > risk) {
          // chưa bị quét trúng lần này, thử lại tick sau
          continue;
        }
        const ownerRes = await client.query<{ owner_character_id: string; user_id: string | null; company_name: string }>(
          `SELECT c.owner_character_id, ch.user_id, c.name AS company_name
           FROM companies c JOIN characters ch ON ch.id = c.owner_character_id
           WHERE c.id = $1`,
          [f.company_id],
        );
        const owner = ownerRes.rows[0];
        if (!owner) {
          await client.query(`UPDATE company_tax_filings SET audit_checked_at = now(), status = 'audited' WHERE id = $1`, [f.id]);
          continue;
        }
        // Truy thu thuế phần chênh lệch + phạt 1.5x trên phần chênh lệch thuế (từ ví chủ sở hữu)
        const additionalTax = Math.max(0, Math.round(evasionGap * 0.10));
        const penalty = Math.round(additionalTax * 1.5);
        const clawbackTotal = additionalTax + penalty;
        try {
          if (clawbackTotal > 0) {
            await postLedger(client, {
              kind: 'tax_evasion_clawback',
              description: `Truy thu & phạt khai khống thuế doanh nghiệp ${f.period_key ? `năm/kỳ ${f.period_key}` : ''}`.trim(),
              referenceType: 'company_tax_filing',
              referenceId: f.id,
              legs: [
                { ownerType: 'character', ownerId: owner.owner_character_id, kind: 'cash', deltaMinor: -clawbackTotal },
                { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: clawbackTotal },
              ],
            });
          }
          await client.query(
            `UPDATE company_tax_filings
                SET audit_checked_at = now(),
                    status = 'penalized',
                    audit_penalty_minor = $2,
                    notes = COALESCE(notes,'') || $3
              WHERE id = $1`,
            [f.id, penalty, ` [AUDIT] Phát hiện khai khống (gap ${evasionGap}). Truy thu ${additionalTax}, phạt ${penalty}.`],
          );
          await client.query(
            `UPDATE characters SET heat_level = LEAST(100, COALESCE(heat_level,0) + 15), updated_at = now() WHERE id = $1`,
            [owner.owner_character_id],
          );
          if (owner.user_id) {
            await enqueueDomainEvent(client, {
              type: 'company.tax.audit.penalized.v1',
              aggregateType: 'company_tax_filing',
              aggregateId: f.id,
              payload: { filingId: f.id, companyId: f.company_id, ownerCharacterId: owner.owner_character_id, additionalTax, penalty },
            });
          }
        } catch (err) {
          logger.warn({ err, filingId: f.id }, 'Tax audit clawback failed for filing');
        }
      }
    } catch (e) {
      try { await client.query('ROLLBACK TO SAVEPOINT audit_step'); } catch { /* ignore */ }
      logger.warn({ err: e }, 'Tax audit step failed (best-effort)');
    }

    // ---- Travel: complete due retreat trips and grant energy rewards ----
    await client.query('SAVEPOINT travel_step');
    try {
      const currentAbsDay = nextYear * GAME_DAYS_PER_YEAR + nextDay;
      const dueTrips = await client.query<{
        id: string; character_id: string; energy_reward: number; reward_applied: boolean; status: string; is_alive: boolean; health_energy: number;
      }>(
        `SELECT t.id, t.character_id, t.energy_reward::int AS energy_reward, COALESCE(t.reward_applied,false) AS reward_applied,
                t.status, COALESCE(c.is_alive,true) AS is_alive, c.health_energy::int AS health_energy
         FROM travel_trips t
         JOIN characters c ON c.id = t.character_id
         WHERE t.status = 'active' AND t.end_abs_day <= $1
         FOR UPDATE OF t`,
        [currentAbsDay],
      );
      let completedTrips = 0;
      let tripEnergyGranted = 0;
      for (const trip of dueTrips.rows) {
        if (trip.status !== 'active') continue;
        if (!trip.reward_applied && trip.is_alive) {
          const gain = Math.max(0, Number(trip.energy_reward ?? 0));
          const newEnergy = Math.max(0, Math.min(100, Number(trip.health_energy ?? 0) + gain));
          await client.query(`UPDATE characters SET health_energy = $2, updated_at = now() WHERE id = $1`, [trip.character_id, newEnergy]);
          tripEnergyGranted += 1;
        }
        await client.query(
          `UPDATE travel_trips SET status = 'completed', reward_applied = true, completed_at = COALESCE(completed_at, now()) WHERE id = $1`,
          [trip.id],
        );
        completedTrips += 1;
      }
      if (dueTrips.rows.length > 0) applied.push(`travel: ${completedTrips} completed, energy_granted=${tripEnergyGranted}`);
    } catch (e) {
      try { await client.query('ROLLBACK TO SAVEPOINT travel_step'); } catch { /* ignore */ }
      logger.warn({ err: e }, 'Travel trip completion step failed (best-effort)');
      applied.push('travel: skipped (error)');
    }

    // ---- Family & children: pregnancy, adoption, childcare, adulthood (daily) ----
    await client.query('SAVEPOINT family_step');
    try {
      const currentAbsDay = nextYear * GAME_DAYS_PER_YEAR + nextDay;
      const toAbs = (y: number, d: number) => y * GAME_DAYS_PER_YEAR + ((d % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;
      const fromAbs = (abs: number) => ({ year: Math.floor(abs / GAME_DAYS_PER_YEAR), day: ((abs % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR });
      const genAccount = () => String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
      const ensureUniqueCccdWorker = async (birthplace: string) => {
        for (let i = 0; i < 30; i++) {
          const c = generateCccd(birthplace || '001');
          const ex = await client.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM characters WHERE cccd = $1) AS exists`, [c]);
          if (!ex.rows[0]?.exists) return c;
        }
        for (let i = 0; i < 100; i++) {
          const c = `${(birthplace || '001').padStart(3,'0').slice(0,3)}${String(Date.now()+i).slice(-9).padStart(9,'0')}`.slice(0,12);
          const ex = await client.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM characters WHERE cccd = $1) AS exists`, [c]);
          if (!ex.rows[0]?.exists) return c;
        }
        throw new Error('cccd_exhausted');
      };
      const ensureUniqueAccountWorker = async () => {
        for (let i = 0; i < 30; i++) {
          const a = genAccount();
          const ex = await client.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM characters WHERE account_number = $1) AS exists`, [a]);
          if (!ex.rows[0]?.exists) return a;
        }
        throw new Error('account_number_exhausted');
      };

      // 1) Active pregnancies: health warning / miscarriage / birth
      const pregRes = await client.query<{
        id: string; pregnant_character_id: string; other_parent_character_id: string;
        due_game_year: number; due_game_day: number; health_warning_days: number;
        pregnant_health: number; pregnant_user_id: string | null; pregnant_name: string; pregnant_birthplace: string | null;
        other_user_id: string | null; other_name: string; other_birthplace: string | null;
        planned_birthplace: string | null;
      }>(
        `SELECT p.id, p.pregnant_character_id, p.other_parent_character_id,
                p.due_game_year, p.due_game_day, COALESCE(p.health_warning_days,0)::int AS health_warning_days,
                ch.health_energy::int AS pregnant_health, ch.user_id AS pregnant_user_id, ch.full_name AS pregnant_name, ch.birthplace AS pregnant_birthplace,
                o.user_id AS other_user_id, o.full_name AS other_name, o.birthplace AS other_birthplace,
                p.planned_birthplace
         FROM pregnancies p
         JOIN characters ch ON ch.id = p.pregnant_character_id
         JOIN characters o ON o.id = p.other_parent_character_id
         WHERE p.status = 'active'
         FOR UPDATE OF p`
      );
      let births = 0, miscarriages = 0, pregWarnings = 0;
      for (const p of pregRes.rows) {
        // miscarriage warning logic based on pregnant character health
        let warnDays = Number(p.health_warning_days ?? 0);
        if (Number(p.pregnant_health) < 30) warnDays += 1; else warnDays = 0;
        await client.query(`UPDATE pregnancies SET health_warning_days = $2, updated_at = now() WHERE id = $1`, [p.id, warnDays]);

        if (Number(p.pregnant_health) < 30 && warnDays === 3) {
          const title = 'Cảnh báo sức khỏe thai kỳ';
          const body = 'Sức khỏe của người mang thai đang dưới 30 kéo dài. Có nguy cơ sảy thai nếu không hồi phục.';
          if (p.pregnant_user_id) await client.query(`INSERT INTO notifications (id,user_id,kind,title,body,payload) VALUES (gen_random_uuid(),$1,'social',$2,$3,$4::jsonb)`, [p.pregnant_user_id, title, body, JSON.stringify({ pregnancyId: p.id, warningDays: warnDays })]).catch(()=>{});
          if (p.other_user_id) await client.query(`INSERT INTO notifications (id,user_id,kind,title,body,payload) VALUES (gen_random_uuid(),$1,'social',$2,$3,$4::jsonb)`, [p.other_user_id, title, body, JSON.stringify({ pregnancyId: p.id, warningDays: warnDays })]).catch(()=>{});
          pregWarnings += 1;
        }
        if (Number(p.pregnant_health) < 30 && warnDays >= 7) {
          await client.query(
            `UPDATE pregnancies SET status='miscarried', miscarriage_reason=$2, completed_at=now(), updated_at=now() WHERE id=$1`,
            [p.id, 'Sức khỏe người mang thai dưới 30 kéo dài (>= 7 ngày game).'],
          );
          const title = 'Sảy thai';
          const body = 'Thai kỳ đã kết thúc do sức khỏe người mang thai xuống thấp kéo dài.';
          if (p.pregnant_user_id) await client.query(`INSERT INTO notifications (id,user_id,kind,title,body,payload) VALUES (gen_random_uuid(),$1,'social',$2,$3,$4::jsonb)`, [p.pregnant_user_id, title, body, JSON.stringify({ pregnancyId: p.id })]).catch(()=>{});
          if (p.other_user_id) await client.query(`INSERT INTO notifications (id,user_id,kind,title,body,payload) VALUES (gen_random_uuid(),$1,'social',$2,$3,$4::jsonb)`, [p.other_user_id, title, body, JSON.stringify({ pregnancyId: p.id })]).catch(()=>{});
          miscarriages += 1;
          continue;
        }

        const dueAbs = toAbs(Number(p.due_game_year), Number(p.due_game_day));
        if (currentAbsDay >= dueAbs) {
          // Birth
          const birthplace = p.planned_birthplace || p.pregnant_birthplace || p.other_birthplace || '001';
          const cccd = await ensureUniqueCccdWorker(birthplace);
          const accountNumber = await ensureUniqueAccountWorker();
          const childNames = ['An','Bình','Chi','Dũng','Gia','Hà','Khang','Linh','Minh','Ngọc','Quân','Trang','Tuấn'];
          const surnames = ['Nguyễn','Trần','Lê','Phạm','Hoàng','Vũ'];
          const fullName = `${surnames[(births + parseInt(p.id.slice(0, 2), 16)) % surnames.length]} ${childNames[(births * 3 + parseInt(p.id.slice(2, 4), 16)) % childNames.length]}`;
          const childRes = await client.query<{ id: string }>(
            `INSERT INTO characters
               (id,user_id,full_name,account_number,cccd,birthplace,age,health_energy,cash_minor,credit_score,heat_level,
                is_alive,marital_status,location_x,location_y,birth_game_year,birth_game_day,death_age,
                is_dependent,parent_1_id,parent_2_id,wellbeing,care_tier,is_adopted,dependent_status,custodial_parent_id,care_debt_minor,unpaid_care_days)
             VALUES (gen_random_uuid(),NULL,$1,$2,$3,$4,0,100,0,650,0,true,'single',0,0,$5,$6,80,
                     true,$7,$8,80,'standard',false,'infant',NULL,0,0)
             RETURNING id`,
            [fullName, accountNumber, cccd, birthplace, nextYear, nextDay, p.pregnant_character_id, p.other_parent_character_id],
          );
          const childId = childRes.rows[0]!.id;
          // family_trees links for inheritance/succession
          await client.query(
            `INSERT INTO family_trees (id, character_id, parent_id, generation_level, inheritance_pct, created_at)
             VALUES (gen_random_uuid(), $1, $2, 1, 0, now())`,
            [childId, p.pregnant_character_id],
          ).catch(()=>{});
          await client.query(
            `INSERT INTO family_trees (id, character_id, parent_id, generation_level, inheritance_pct, created_at)
             VALUES (gen_random_uuid(), $1, $2, 1, 0, now())`,
            [childId, p.other_parent_character_id],
          ).catch(()=>{});
          await client.query(
            `UPDATE pregnancies SET status='completed', child_character_id=$2, completed_at=now(), updated_at=now() WHERE id=$1`,
            [p.id, childId],
          );
          const title = 'Chào đón thành viên mới';
          const body = `Con của bạn (${fullName}) đã chào đời.`;
          if (p.pregnant_user_id) await client.query(`INSERT INTO notifications (id,user_id,kind,title,body,payload) VALUES (gen_random_uuid(),$1,'social',$2,$3,$4::jsonb)`, [p.pregnant_user_id, title, body, JSON.stringify({ pregnancyId: p.id, childId })]).catch(()=>{});
          if (p.other_user_id) await client.query(`INSERT INTO notifications (id,user_id,kind,title,body,payload) VALUES (gen_random_uuid(),$1,'social',$2,$3,$4::jsonb)`, [p.other_user_id, title, body, JSON.stringify({ pregnancyId: p.id, childId })]).catch(()=>{});
          births += 1;
        }
      }
      if (pregRes.rows.length > 0) applied.push(`pregnancies: ${pregRes.rows.length} checked, births=${births}, miscarriages=${miscarriages}, warnings=${pregWarnings}`);

      // 2) Adoption applications: auto-complete after 30 game days
      const adoptRes = await client.query<{
        id: string; applicant_character_id: string; spouse_character_id: string | null; child_character_id: string;
        review_complete_game_year: number; review_complete_game_day: number;
        applicant_user_id: string | null; spouse_user_id: string | null; child_name: string; applicant_name: string;
        preferred_birthplace: string | null;
      }>(
        `SELECT a.id, a.applicant_character_id, a.spouse_character_id, a.child_character_id,
                a.review_complete_game_year, a.review_complete_game_day,
                ap.user_id AS applicant_user_id, sp.user_id AS spouse_user_id, ch.full_name AS child_name, ap.full_name AS applicant_name,
                a.preferred_birthplace
         FROM adoption_applications a
         JOIN characters ap ON ap.id = a.applicant_character_id
         LEFT JOIN characters sp ON sp.id = a.spouse_character_id
         JOIN characters ch ON ch.id = a.child_character_id
         WHERE a.status = 'pending_review'
         FOR UPDATE OF a`
      );
      let adoptionsCompleted = 0;
      for (const a of adoptRes.rows) {
        const dueAbs = toAbs(Number(a.review_complete_game_year), Number(a.review_complete_game_day));
        if (currentAbsDay < dueAbs) continue;
        const parent1 = a.applicant_character_id;
        const parent2 = a.spouse_character_id;
        let newCccd: string | null = null;
        const preferredBirthplace = (a.preferred_birthplace ?? '').trim() || null;
        if (preferredBirthplace) {
          newCccd = await ensureUniqueCccdWorker(preferredBirthplace);
        }
        await client.query(
          `UPDATE characters
           SET parent_1_id = $2, parent_2_id = $3, is_adopted = true,
               is_dependent = true, dependent_status = CASE WHEN age >= 18 THEN 'adult' ELSE 'child' END,
               wellbeing = COALESCE(wellbeing, 70), care_tier = COALESCE(care_tier,'standard'),
               custodial_parent_id = NULL,
               birthplace = COALESCE($4, birthplace),
               cccd = COALESCE($5, cccd),
               updated_at = now()
           WHERE id = $1`,
          [a.child_character_id, parent1, parent2, preferredBirthplace, newCccd],
        );
        await client.query(`DELETE FROM family_trees WHERE character_id = $1`, [a.child_character_id]).catch(()=>{});
        await client.query(`INSERT INTO family_trees (id, character_id, parent_id, generation_level, inheritance_pct, created_at) VALUES (gen_random_uuid(), $1, $2, 1, 0, now())`, [a.child_character_id, parent1]).catch(()=>{});
        if (parent2) await client.query(`INSERT INTO family_trees (id, character_id, parent_id, generation_level, inheritance_pct, created_at) VALUES (gen_random_uuid(), $1, $2, 1, 0, now())`, [a.child_character_id, parent2]).catch(()=>{});
        await client.query(`UPDATE adoption_applications SET status='completed', completed_at=now(), updated_at=now() WHERE id=$1`, [a.id]);
        const title = 'Hoàn tất nhận con nuôi';
        const body = `Hồ sơ nhận nuôi ${a.child_name} đã được xét duyệt và hoàn tất.`;
        if (a.applicant_user_id) await client.query(`INSERT INTO notifications (id,user_id,kind,title,body,payload) VALUES (gen_random_uuid(),$1,'social',$2,$3,$4::jsonb)`, [a.applicant_user_id, title, body, JSON.stringify({ applicationId: a.id, childId: a.child_character_id })]).catch(()=>{});
        if (a.spouse_user_id) await client.query(`INSERT INTO notifications (id,user_id,kind,title,body,payload) VALUES (gen_random_uuid(),$1,'social',$2,$3,$4::jsonb)`, [a.spouse_user_id, title, body, JSON.stringify({ applicationId: a.id, childId: a.child_character_id })]).catch(()=>{});
        adoptionsCompleted += 1;
      }
      if (adoptRes.rows.length > 0) applied.push(`adoptions: ${adoptRes.rows.length} pending_review checked, completed=${adoptionsCompleted}`);

      // 3) Daily childcare costs / wellbeing / lost custody + adulthood
      const childrenRes = await client.query<{
        id: string; full_name: string; age: number; wellbeing: number | null; care_tier: string | null;
        care_debt_minor: string; unpaid_care_days: number; is_dependent: boolean; dependent_status: string;
        custodial_parent_id: string | null; parent_1_id: string | null; parent_2_id: string | null;
        p1_user_id: string | null; p2_user_id: string | null; cust_user_id: string | null;
      }>(
        `SELECT c.id, c.full_name, c.age, c.wellbeing, c.care_tier,
                COALESCE(c.care_debt_minor,0)::text AS care_debt_minor,
                COALESCE(c.unpaid_care_days,0)::int AS unpaid_care_days,
                COALESCE(c.is_dependent,false) AS is_dependent, COALESCE(c.dependent_status,'none') AS dependent_status,
                c.custodial_parent_id, c.parent_1_id, c.parent_2_id,
                p1.user_id AS p1_user_id, p2.user_id AS p2_user_id, cu.user_id AS cust_user_id
         FROM characters c
         LEFT JOIN characters p1 ON p1.id = c.parent_1_id
         LEFT JOIN characters p2 ON p2.id = c.parent_2_id
         LEFT JOIN characters cu ON cu.id = c.custodial_parent_id
         WHERE COALESCE(c.is_alive,true)=true
           AND (COALESCE(c.is_dependent,false)=true OR c.dependent_status IN ('infant','child'))
         FOR UPDATE OF c`
      );
      let careProcessed = 0, lostCustody = 0, becameAdult = 0;
      for (const ch of childrenRes.rows) {
        const age = Number(ch.age ?? 0);
        if (age >= 18) {
          await client.query(
            `UPDATE characters
             SET is_dependent = false, dependent_status = 'adult',
                 child_support_percent = CASE WHEN custodial_parent_id IS NULL THEN 0 ELSE child_support_percent END,
                 unpaid_care_days = 0, updated_at = now()
             WHERE id = $1`,
            [ch.id],
          );
          becameAdult += 1;
          continue;
        }
        if (ch.dependent_status === 'lost_custody' || ch.is_dependent === false) continue;

        const tier = (ch.care_tier === 'economy' || ch.care_tier === 'premium') ? ch.care_tier : 'standard';
        const cost = tier === 'economy' ? 50_000 : tier === 'premium' ? 400_000 : 150_000;
        const payerId = ch.custodial_parent_id || ch.parent_1_id || ch.parent_2_id;
        let paid = false;
        if (payerId) {
          try {
            await postLedger(client, {
              kind: 'child_care_cost',
              description: `Chi phí nuôi dưỡng con (${ch.full_name})`,
              referenceType: 'character',
              referenceId: ch.id,
              legs: [
                { ownerType: 'character', ownerId: payerId, kind: 'cash', deltaMinor: -cost },
                { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: cost },
              ],
            });
            paid = true;
          } catch {
            paid = false;
          }
        }
        let wellbeing = ch.wellbeing == null ? 70 : Number(ch.wellbeing);
        let debt = Number(ch.care_debt_minor ?? 0);
        let unpaidDays = Number(ch.unpaid_care_days ?? 0);
        if (paid) {
          unpaidDays = 0;
          wellbeing = Math.min(100, wellbeing + 1);
        } else {
          debt += cost;
          wellbeing = Math.max(0, wellbeing - 10);
          unpaidDays += 1;
        }

        const loseCustody = unpaidDays >= 3 || wellbeing <= 0;
        if (loseCustody) {
          await client.query(
            `UPDATE characters
             SET wellbeing = $2, care_debt_minor = $3::bigint, unpaid_care_days = $4,
                 is_dependent = false, dependent_status = 'lost_custody',
                 custodial_parent_id = NULL, child_support_payer_id = NULL, child_support_percent = 0,
                 updated_at = now()
             WHERE id = $1`,
            [ch.id, wellbeing, debt, unpaidDays],
          );
          const title = 'Mất quyền nuôi con';
          const body = `Do thiếu điều kiện nuôi dưỡng, quyền nuôi ${ch.full_name} đã bị thu hồi.`;
          for (const uid of [ch.cust_user_id, ch.p1_user_id, ch.p2_user_id]) {
            if (uid) await client.query(`INSERT INTO notifications (id,user_id,kind,title,body,payload) VALUES (gen_random_uuid(),$1,'social',$2,$3,$4::jsonb)`, [uid, title, body, JSON.stringify({ childId: ch.id })]).catch(()=>{});
          }
          lostCustody += 1;
        } else {
          await client.query(
            `UPDATE characters
             SET wellbeing = $2, care_debt_minor = $3::bigint, unpaid_care_days = $4, updated_at = now()
             WHERE id = $1`,
            [ch.id, wellbeing, debt, unpaidDays],
          );
        }
        careProcessed += 1;
      }
      if (childrenRes.rows.length > 0) applied.push(`family_care: ${careProcessed} processed, adults=${becameAdult}, lost_custody=${lostCustody}`);
    } catch (e) {
      try { await client.query('ROLLBACK TO SAVEPOINT family_step'); } catch { /* ignore */ }
      logger.warn({ err: e }, 'Family/children tick step failed (best-effort)');
      applied.push('family: skipped (error)');
    }

    try {
      await client.query('SAVEPOINT npc_runtime_step');
      const npcRuntimeMsg = await syncNpcRuntime(client, {
        gameYear: nextYear,
        dayOfYear: nextDay,
        period: nextTime.period,
      });
      await client.query('RELEASE SAVEPOINT npc_runtime_step');
      applied.push(npcRuntimeMsg);
    } catch (e) {
      try { await client.query('ROLLBACK TO SAVEPOINT npc_runtime_step'); } catch { /* ignore */ }
      logger.warn({ err: e }, 'NPC runtime tick step failed (best-effort)');
      applied.push('npc_runtime: skipped (error)');
    }

    try {
      await client.query('SAVEPOINT production_step');
      const prodMsg = await processProductionOrders(client, { gameYear: nextYear, dayOfYear: nextDay });
      await client.query('RELEASE SAVEPOINT production_step');
      applied.push(prodMsg);
    } catch (e) {
      try { await client.query('ROLLBACK TO SAVEPOINT production_step'); } catch { /* ignore */ }
      logger.warn({ err: e }, 'Production tick step failed (best-effort)');
      applied.push('production: skipped (error)');
    }

    await client.query('COMMIT');
    logger.info(
      { tick, appliedCount: applied.length, durationMs: Date.now() - startedAt },
      'Game tick committed',
    );

    // Publish đồng bộ thời gian game cho toàn bộ client (best-effort, realtime channel)
    try {
      const nowIso = new Date().toISOString();
      const payload = {
        currentDay: nextDay,
        dayOfYear: nextDay,
        currentYear: nextYear,
        currentMonth: nextTime.month,
        currentDayOfMonth: nextTime.day,
        season: nextSeason,
        period: nextTime.period,
        hour: nextTime.hour ?? 0,
        minute: nextTime.minute ?? 0,
        tick,
        at: nowIso,
        tickUpdatedAt: nowIso,
        standard: '1_day_game_per_1_real_minute',
      };
      await publishClient.publish(
        env.REALTIME_CHANNEL,
        JSON.stringify({ room: '*', event: 'game:time', payload }),
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to publish game time tick (best-effort)');
    }

    return {
      tick,
      inGameYear: nextYear,
      inGameMonth: nextTime.month,
      inGameDay: nextTime.day,
      dayOfYear: nextDay,
      season: nextSeason,
      applied,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err: error, tick }, 'Game tick failed');
    throw error;
  } finally {
    client.release();
  }
}
