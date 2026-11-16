import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import { enqueueDomainEvent } from '../outboxEvents.js';
import { publishClient } from '../publisher.js';
import { env } from '../config/env.js';
import { Rooms } from '@efls/contracts';
import { accrueSimpleInterest, computeGameAge, DEFAULT_SEASON_RANGES, deriveCanonicalGameTime, evaluateLoanHealth, GAME_DAYS_PER_YEAR, GAME_START_YEAR, normalizeSeasonRanges, resolveSeasonEffects } from '@efls/domain';

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

let tick = 0;

export async function processGameTick(): Promise<GameTickResult> {
  tick += 1;
  const now = new Date();
  logger.info({ tick, now }, 'Game tick started');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
    }>(
      `SELECT id, age, health_energy, death_age, birth_game_year, birth_game_day, is_alive
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
      const deathAge = c.death_age != null ? Number(c.death_age) : null;
      if (deathAge != null && nextAge >= deathAge) {
        nextAge = deathAge;
      }
      // Tiêu hao thể lực chịu hiệu ứng mùa (seasonEffects.energyPct), áp dụng theo năm game.
      const rawNextHealth = Number(c.health_energy) + (nextDay === 0 ? -2 * Number(seasonEffects.energy ?? 1) : 0);
      const nextHealth = Math.max(0, Math.min(100, Math.round(rawNextHealth)));

      await client.query(
        `UPDATE characters SET age = $1, health_energy = $2, updated_at = now() WHERE id = $3`,
        [nextAge, nextHealth, c.id],
      );
    }
    applied.push(`characters: ${characters.rows.length} updated`);

    // ---- 3. Salary income from active employments ----
    const employments = await client.query<{
      character_id: string;
      salary_minor: string;
    }>(`SELECT character_id, salary_minor FROM employments WHERE status = 'active'`);

    let salariesPaid = 0;
    for (const emp of employments.rows) {
      // Thu nhập từ việc làm chịu hiệu ứng năng suất của mùa (seasonEffects.productivityPct)
      const salary = Math.max(0, Math.round(Number(emp.salary_minor) * seasonEffects.productivity));
      if (salary <= 0) continue;

      try {
        await postLedger(client, {
          kind: 'salary_income',
          description: 'Nhận lương',
          referenceType: 'employment',
          referenceId: emp.character_id,
          legs: [
            { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: 'cash', deltaMinor: -salary },
            { ownerType: 'character', ownerId: emp.character_id, kind: 'cash', deltaMinor: salary },
          ],
        });
        salariesPaid += 1;

        await enqueueDomainEvent(client, {
          type: 'character.income.v1',
          aggregateType: 'character',
          aggregateId: emp.character_id,
          payload: {
            characterId: emp.character_id,
            amountMinor: salary,
            kind: 'salary',
            at: now.toISOString(),
          },
        });
      } catch (e) {
        logger.warn({ err: e, characterId: emp.character_id }, 'Failed to pay salary');
      }
    }
    applied.push(`employments: ${salariesPaid}/${employments.rows.length} salaries paid`);

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
      else if (ch.death_age != null && effectiveAge >= Number(ch.death_age)) reason = 'Đạt tuổi thọ tối đa (do quản trị cấu hình)';
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

    // ---- 8. Company auto revenue settlement (every 30 game days / end of month) ----
    await client.query('SAVEPOINT company_settlement_step');
    try {
      if (nextTime.day === 1) {
        const prevMonth = nextTime.month === 1 ? 12 : nextTime.month - 1;
        const prevYear = nextTime.month === 1 ? nextYear - 1 : nextYear;
        const periodKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        const revenueMultiplier = Number(seasonEffects.revenue ?? 1);

        const cfgRes = await client.query<{
          industry_type: string;
          monthly_rate_pct: string;
          min_revenue_minor: string;
          max_revenue_minor: string;
        }>(`SELECT industry_type, monthly_rate_pct, min_revenue_minor, max_revenue_minor FROM industry_revenue_configs`);
        const cfgMap = new Map(cfgRes.rows.map((r) => [r.industry_type, r]));

        const companiesRes = await client.query<{
          id: string;
          owner_character_id: string;
          industry: string;
          valuation_minor: string;
          cash_minor: string;
          revenue_retain_pct: string | number;
        }>(
          `SELECT c.id, c.owner_character_id, c.industry, c.valuation_minor, c.cash_minor, COALESCE(c.revenue_retain_pct,0) AS revenue_retain_pct
           FROM companies c
           WHERE c.status = 'active'
             AND EXISTS (SELECT 1 FROM business_licenses bl WHERE bl.company_id = c.id AND bl.status = 'active')
             AND NOT EXISTS (SELECT 1 FROM company_revenue_settlements s WHERE s.company_id = c.id AND s.period_key = $1)`,
          [periodKey],
        );

        let settled = 0;
        for (const co of companiesRes.rows) {
          const cfg = cfgMap.get(co.industry);
          if (!cfg) continue;
          const ratePct = Number(cfg.monthly_rate_pct ?? 0);
          if (!Number.isFinite(ratePct) || ratePct <= 0) continue;

          const effectiveVal = await client.query<{ v: string }>(`SELECT effective_company_valuation($1::uuid) AS v`, [co.id]).then(r => Number(r.rows[0]?.v ?? 0)).catch(() => Math.max(0, Number(co.valuation_minor ?? 0), Number(co.cash_minor ?? 0))); const baseCapital = Math.max(0, effectiveVal, Number(co.cash_minor ?? 0));
          let actualRevenue = Math.round(baseCapital * (ratePct / 100) * revenueMultiplier);
          const minRev = Math.max(0, Number(cfg.min_revenue_minor ?? 0));
          const maxRev = Math.max(0, Number(cfg.max_revenue_minor ?? 0));
          if (minRev > 0) actualRevenue = Math.max(actualRevenue, minRev);
          if (maxRev > 0) actualRevenue = Math.min(actualRevenue, maxRev);
          if (!Number.isFinite(actualRevenue) || actualRevenue <= 0) {
            // vẫn ghi nhận kỳ (0) để tránh lặp tính? bỏ qua nếu 0
            continue;
          }

          try {
            const retainPct = Math.max(0, Math.min(100, Number(co.revenue_retain_pct ?? 0)));
            const retainedMinor = Math.min(actualRevenue, Math.max(0, Math.round(actualRevenue * (retainPct / 100))));
            const ownerPayoutMinor = Math.max(0, actualRevenue - retainedMinor);

            // 1) Phân bổ doanh thu thực tế: một phần giữ lại quỹ công ty (2B), phần còn lại về ví chủ sở hữu
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

            // 2) Bút toán đối chiếu ACTUAL trong sổ cái công ty (ghi nhận tổng doanh thu thực tế của kỳ)
            await client.query(
              `INSERT INTO company_ledger_entries
                 (company_id, entry_type, amount_minor, declared_amount_minor, description, is_evasion, meta, ledger_kind, period_key)
               VALUES ($1,'revenue',$2,$2,$3,false,$4::jsonb,'ACTUAL',$5)`,
              [
                co.id,
                actualRevenue,
                `Doanh thu thực tế tự động kỳ ${periodKey} (trả chủ sở hữu ${ownerPayoutMinor}, giữ lại quỹ ${retainedMinor}, tỉ lệ giữ ${retainPct}%)`,
                JSON.stringify({ source: 'auto_30d', periodKey, baseCapitalMinor: baseCapital, monthlyRatePct: ratePct, seasonMultiplier: revenueMultiplier, retainPct, retainedMinor, ownerPayoutMinor }),
                periodKey,
              ],
            );

            // 3) Đánh dấu đã chốt kỳ (idempotent)
            await client.query(
              `INSERT INTO company_revenue_settlements
                 (id, company_id, owner_character_id, period_key, game_year, game_month, base_capital_minor, monthly_rate_pct, season_multiplier, actual_revenue_minor, retained_minor, owner_payout_minor, status)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'settled')
               ON CONFLICT (company_id, period_key) DO NOTHING`,
              [co.id, co.owner_character_id, periodKey, prevYear, prevMonth, Math.trunc(baseCapital), ratePct, revenueMultiplier, actualRevenue, retainedMinor, ownerPayoutMinor],
            );

            await enqueueDomainEvent(client, {
              type: 'company.revenue.settled.v1',
              aggregateType: 'company',
              aggregateId: co.id,
              payload: { companyId: co.id, ownerCharacterId: co.owner_character_id, periodKey, actualRevenueMinor: actualRevenue, retainedMinor, ownerPayoutMinor, retainPct },
            });
            settled += 1;
          } catch (err) {
            logger.warn({ err, companyId: co.id, periodKey }, 'Company auto revenue settlement failed for company');
          }
        }
        if (settled > 0) applied.push(`companies: auto revenue settled ${settled} for ${periodKey}`);
      }
    } catch (e) {
      try { await client.query('ROLLBACK TO SAVEPOINT company_settlement_step'); } catch { /* ignore */ }
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
              description: `Truy thu & phạt khai khống thuế kỳ ${f.period_key ?? ''}`.trim(),
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

    await client.query('COMMIT');
    logger.info({ tick, appliedCount: applied.length }, 'Game tick committed');

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
