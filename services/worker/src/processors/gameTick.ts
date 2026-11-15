import { pool } from '../db.js';
import { logger } from '../logger.js';
import { enqueueDomainEvent } from '../outboxEvents.js';
import { accrueSimpleInterest, evaluateLoanHealth } from '@efls/domain';

export interface GameTickResult {
  tick: number;
  inGameYear: number;
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
    const gameState = await client.query<{
      current_day: string;
      current_year: string;
      season: string;
    }>(`SELECT current_day, current_year, season FROM game_state WHERE id = 1`);

    const currentDay = Number(gameState.rows[0]?.current_day ?? 0);
    const currentYear = Number(gameState.rows[0]?.current_year ?? 1);
    const currentSeason = gameState.rows[0]?.season ?? 'spring';

    let nextDay = currentDay + 1;
    let nextYear = currentYear;
    let nextSeason = currentSeason;

    if (nextDay >= 365) {
      nextDay = 0;
      nextYear += 1;
    }
    const nextSeasonMap: Record<string, string> = {
      spring: 'summer',
      summer: 'autumn',
      autumn: 'winter',
      winter: 'spring',
    };
    nextSeason = nextSeasonMap[currentSeason] ?? 'spring';

    await client.query(
      `UPDATE game_state SET current_day = $1, current_year = $2, season = $3, updated_at = now() WHERE id = 1`,
      [nextDay, nextYear, nextSeason],
    );
    applied.push(`game_state: day=${nextDay} year=${nextYear} season=${nextSeason}`);

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

    await client.query('COMMIT');
    logger.info({ tick, appliedCount: applied.length }, 'Game tick committed');

    return { tick, inGameYear: nextYear, season: nextSeason, applied };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err: error, tick }, 'Game tick failed');
    throw error;
  } finally {
    client.release();
  }
}
