import { pool } from '../db.js';
import { logger } from '../logger.js';
import { enqueueDomainEvent } from '../outboxEvents.js';
import { publishClient } from '../publisher.js';
import { env } from '../config/env.js';
import { Rooms } from '@efls/contracts';
import { accrueSimpleInterest, deriveCanonicalGameTime, evaluateLoanHealth, GAME_DAYS_PER_YEAR } from '@efls/domain';

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
    }>(`SELECT current_day, current_year, season FROM game_state WHERE id = 1`);

    const currentDayRaw = Number(gameState.rows[0]?.current_day ?? 0);
    const currentYear = Number(gameState.rows[0]?.current_year ?? 1);
    const normalizedCurrentDay = ((Math.floor(currentDayRaw) % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;

    let nextDay = normalizedCurrentDay + 1;
    let nextYear = currentYear;
    if (nextDay >= GAME_DAYS_PER_YEAR) {
      nextDay = 0;
      nextYear += 1;
    }
    const nextTime = deriveCanonicalGameTime({ dayOfYear: nextDay, year: nextYear });
    const nextSeason = nextTime.season;

    await client.query(
      `UPDATE game_state SET current_day = $1, current_year = $2, season = $3, updated_at = now() WHERE id = 1`,
      [nextDay, nextYear, nextSeason],
    );
    applied.push(`game_state: day=${nextDay} month=${nextTime.month} dayOfMonth=${nextTime.day} year=${nextYear} season=${nextSeason}`);

    // ---- 2. Character aging, health, energy ----
    const characters = await client.query<{
      id: string;
      age: number;
      health_energy: number;
    }>(`SELECT id, age, health_energy FROM characters`);

    for (const c of characters.rows) {
      const nextAge = c.age + (nextDay === 0 ? 1 : 0);
      const nextHealth = Math.max(0, Math.min(100, c.health_energy + (nextDay === 0 ? -2 : 0)));

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

    for (const emp of employments.rows) {
      const salary = Number(emp.salary_minor);
      if (salary <= 0) continue;

      await client.query(
        `UPDATE characters SET cash_minor = cash_minor + $1, updated_at = now() WHERE id = $2`,
        [salary, emp.character_id],
      );

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
    }
    applied.push(`employments: ${employments.rows.length} salaries paid`);

    // ---- 4. Rent collection ----
    const leases = await client.query<{
      id: string;
      property_id: string;
      tenant_character_id: string;
      monthly_rent_minor: string;
      next_due_at: Date;
    }>(
      `SELECT id, property_id, tenant_character_id, monthly_rent_minor, next_due_at FROM leases WHERE status = 'active'`,
    );

    for (const lease of leases.rows) {
      const rent = Number(lease.monthly_rent_minor);
      if (rent <= 0) continue;
      if (lease.next_due_at > now) continue;

      const property = await client.query<{
        owner_character_id: string | null;
      }>(`SELECT owner_character_id FROM properties WHERE id = $1`, [lease.property_id]);

      const ownerId = property.rows[0]?.owner_character_id ?? null;
      if (!ownerId || ownerId === lease.tenant_character_id) continue;

      await client.query(
        `UPDATE characters SET cash_minor = GREATEST(0, cash_minor - $1), updated_at = now() WHERE id = $2 AND cash_minor >= $1`,
        [rent, lease.tenant_character_id],
      );

      await client.query(
        `UPDATE characters SET cash_minor = cash_minor + $1, updated_at = now() WHERE id = $2`,
        [rent, ownerId],
      );

      await client.query(
        `UPDATE leases SET next_due_at = next_due_at + interval '1 month', updated_at = now() WHERE id = $1`,
        [lease.id],
      );

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
    }
    applied.push(`leases: ${leases.rows.length} rent processed`);

    // ---- 5. Loan interest + default/foreclosure ----
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

      // Accrue interest if active/grace and due date passed
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
          `UPDATE loans SET next_due_at = next_due_at + interval '1 month' WHERE id = $1`,
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


    // ---- 8. Death check (health <= 0 or age>=65 exponential risk) ----
    const deathCandidates = await client.query<{ id: string; user_id: string | null; age: number; health_energy: number; is_alive: boolean }>(
      `SELECT id, user_id, age, health_energy, COALESCE(is_alive,true) as is_alive FROM characters WHERE COALESCE(is_alive,true)=true`,
    );
    for (const ch of deathCandidates.rows) {
      let reason: string | null = null;
      if (Number(ch.health_energy) <= 0) reason = 'Sức khỏe cạn kiệt';
      else if (Number(ch.age) >= 65) {
        const pDeath = Math.min(0.95, Math.pow(1.12, Number(ch.age) - 65) * 0.02);
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
                // credit via character cash + ledger (government -> character)
                await client.query(
                  `UPDATE characters SET cash_minor = cash_minor + $1, updated_at = now() WHERE id = $2`,
                  [salaryMinor, term.winner_character_id],
                );
                await client.query(
                  `INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, balance_minor, is_system)
                   VALUES (gen_random_uuid(), 'character', $1, 'cash', 0, false)
                   ON CONFLICT (owner_type, owner_id, kind, currency) DO NOTHING`,
                  [term.winner_character_id],
                );
                await client.query(
                  `INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, balance_minor, is_system)
                   VALUES (gen_random_uuid(), 'government', $1, 'treasury', 0, true)
                   ON CONFLICT (owner_type, owner_id, kind, currency) DO NOTHING`,
                  ['00000000-0000-0000-0000-000000000002'],
                );
                await client.query(
                  `UPDATE ledger_accounts SET balance_minor = balance_minor - $2, updated_at = now()
                   WHERE owner_type='government' AND owner_id=$1 AND kind='treasury' AND currency='VND'`,
                  ['00000000-0000-0000-0000-000000000002', salaryMinor],
                );
                await client.query(
                  `UPDATE ledger_accounts SET balance_minor = balance_minor + $2, updated_at = now()
                   WHERE owner_type='character' AND owner_id=$1 AND kind='cash' AND currency='VND'`,
                  [term.winner_character_id, salaryMinor],
                );
                await client.query(
                  `INSERT INTO ledger_transactions (id, from_account_id, to_account_id, amount_minor, currency, kind, description, reference_type, reference_id)
                   SELECT gen_random_uuid(), g.id, c.id, $3, 'VND', 'mayor_salary', 'Phụ cấp Thị trưởng', 'election', $4::uuid
                   FROM ledger_accounts g, ledger_accounts c
                   WHERE g.owner_type='government' AND g.owner_id=$1 AND g.kind='treasury' AND g.currency='VND'
                     AND c.owner_type='character' AND c.owner_id=$2 AND c.kind='cash' AND c.currency='VND'`,
                  ['00000000-0000-0000-0000-000000000002', term.winner_character_id, salaryMinor, term.id],
                );
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
      logger.warn({ err: e }, 'Mayor term/salary tick step failed (best-effort)');
    }

    await client.query('COMMIT');
    logger.info({ tick, appliedCount: applied.length }, 'Game tick committed');

    // Publish đồng bộ thời gian game cho toàn bộ người dùng (best-effort)
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
        hour: 0,
        minute: 0,
        tick,
        at: nowIso,
        standard: '1_day_game_per_1_real_minute',
      };
      const usersRes = await pool.query<{ id: string }>(`SELECT id FROM users`);
      await Promise.all(
        usersRes.rows.map((u) =>
          publishClient.publish(
            env.DOMAIN_EVENT_CHANNEL,
            JSON.stringify({ room: Rooms.character(u.id), event: 'game:time', payload }),
          ),
        ),
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
