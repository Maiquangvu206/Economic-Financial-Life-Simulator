import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface LoanRow {
  id: string;
  borrower_id: string;
  lender_type: 'bank' | 'player' | 'npc';
  principal_minor: string;
  outstanding_minor: string;
  interest_rate_pct: string;
  term_months: number;
  monthly_payment_minor: string;
  next_due_at: Date;
  grace_period_end: Date;
  status: 'active' | 'grace' | 'defaulted' | 'foreclosed' | 'repaid';
  collateral_property_id: string | null;
  created_at: Date;
}

export interface SavingsRow {
  id: string;
  character_id: string;
  balance_minor: string;
  annual_rate_pct: string;
  opened_at: Date;
}

export interface CreateLoanInput {
  borrowerId: string;
  principalMinor: number;
  interestRatePct: number;
  termMonths: number;
  monthlyPaymentMinor: number;
  gracePeriodEnd: Date;
  nextDueAt: Date;
  collateralPropertyId: string | null;
}

export class BankingRepository {
  constructor(readonly db: Db = pool) {}

  async listLoans(characterId: string): Promise<LoanRow[]> {
    const result = await this.db.query<LoanRow>(
      `SELECT id, borrower_id, lender_type, principal_minor, outstanding_minor,
              interest_rate_pct, term_months, monthly_payment_minor, next_due_at,
              grace_period_end, status, collateral_property_id, created_at
       FROM loans
       WHERE borrower_id = $1
       ORDER BY created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async findLoan(loanId: string, characterId: string, db: Db = this.db): Promise<LoanRow | null> {
    const result = await db.query<LoanRow>(
      `SELECT id, borrower_id, lender_type, principal_minor, outstanding_minor,
              interest_rate_pct, term_months, monthly_payment_minor, next_due_at,
              grace_period_end, status, collateral_property_id, created_at
       FROM loans
       WHERE id = $1 AND borrower_id = $2
       LIMIT 1`,
      [loanId, characterId],
    );
    return result.rows[0] ?? null;
  }

  async createLoan(db: Db, input: CreateLoanInput): Promise<LoanRow> {
    const result = await db.query<LoanRow>(
      `INSERT INTO loans
         (id, borrower_id, lender_type, principal_minor, outstanding_minor,
          interest_rate_pct, term_months, monthly_payment_minor, next_due_at,
          grace_period_end, status, collateral_property_id)
       VALUES (gen_random_uuid(), $1, 'bank', $2, $2, $3, $4, $5, $6, $7, 'active', $8)
       RETURNING id, borrower_id, lender_type, principal_minor, outstanding_minor,
                 interest_rate_pct, term_months, monthly_payment_minor, next_due_at,
                 grace_period_end, status, collateral_property_id, created_at`,
      [
        input.borrowerId,
        input.principalMinor,
        input.interestRatePct,
        input.termMonths,
        input.monthlyPaymentMinor,
        input.nextDueAt,
        input.gracePeriodEnd,
        input.collateralPropertyId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Loan insert returned no row');
    return row;
  }

  async updateLoanAfterPayment(
    db: Db,
    loanId: string,
    outstandingMinor: number,
    status: LoanRow['status'],
    nextDueAt: Date | null,
  ): Promise<void> {
    await db.query(
      `UPDATE loans
       SET outstanding_minor = $2, status = $3,
           next_due_at = COALESCE($4, next_due_at), updated_at = now()
       WHERE id = $1`,
      [loanId, outstandingMinor, status, nextDueAt],
    );
  }

  async insertPayment(
    db: Db,
    input: {
      loanId: string;
      amountMinor: number;
      principalMinor: number;
      interestMinor: number;
      onTime: boolean;
    },
  ): Promise<void> {
    await db.query(
      `INSERT INTO loan_payments
         (id, loan_id, amount_minor, principal_minor, interest_minor, on_time)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [input.loanId, input.amountMinor, input.principalMinor, input.interestMinor, input.onTime],
    );
  }

  async paymentStats(
    db: Db,
    characterId: string,
  ): Promise<{ onTime: number; late: number; defaults: number; oldestLoan: Date | null }> {
    const result = await db.query<{
      on_time: string;
      late: string;
      defaults: string;
      oldest: Date | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE p.on_time) AS on_time,
         COUNT(*) FILTER (WHERE NOT p.on_time) AS late,
         (SELECT COUNT(*) FROM loans l2
           WHERE l2.borrower_id = $1 AND l2.status IN ('defaulted', 'foreclosed')) AS defaults,
         (SELECT MIN(created_at) FROM loans l3 WHERE l3.borrower_id = $1) AS oldest
       FROM loan_payments p
       JOIN loans l ON l.id = p.loan_id
       WHERE l.borrower_id = $1`,
      [characterId],
    );
    const row = result.rows[0];
    return {
      onTime: Number(row?.on_time ?? 0),
      late: Number(row?.late ?? 0),
      defaults: Number(row?.defaults ?? 0),
      oldestLoan: row?.oldest ?? null,
    };
  }

  async monthlyDebtService(db: Db, characterId: string): Promise<number> {
    const result = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(monthly_payment_minor), 0) AS total
       FROM loans WHERE borrower_id = $1 AND status IN ('active', 'grace')`,
      [characterId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async activeSalary(db: Db, characterId: string): Promise<number> {
    const result = await db.query<{ salary_minor: string }>(
      `SELECT salary_minor FROM employments
       WHERE character_id = $1 AND status = 'active' LIMIT 1`,
      [characterId],
    );
    return Number(result.rows[0]?.salary_minor ?? 0);
  }

  async totalDebt(db: Db, characterId: string): Promise<number> {
    const result = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(outstanding_minor), 0) AS total
       FROM loans WHERE borrower_id = $1 AND status IN ('active', 'grace', 'defaulted')`,
      [characterId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async ensureSavingsAccount(db: Db, characterId: string): Promise<SavingsRow> {
    const existing = await db.query<SavingsRow>(
      `SELECT id, character_id, balance_minor, annual_rate_pct, opened_at
       FROM savings_accounts WHERE character_id = $1`,
      [characterId],
    );
    if (existing.rows[0]) return existing.rows[0];

    const inserted = await db.query<SavingsRow>(
      `INSERT INTO savings_accounts (id, character_id)
       VALUES (gen_random_uuid(), $1)
       ON CONFLICT (character_id) DO NOTHING
       RETURNING id, character_id, balance_minor, annual_rate_pct, opened_at`,
      [characterId],
    );
    if (inserted.rows[0]) return inserted.rows[0];

    const raced = await db.query<SavingsRow>(
      `SELECT id, character_id, balance_minor, annual_rate_pct, opened_at
       FROM savings_accounts WHERE character_id = $1`,
      [characterId],
    );
    if (!raced.rows[0]) throw new Error('Failed to create savings account');
    return raced.rows[0];
  }

  async setSavingsBalance(db: Db, characterId: string, balanceMinor: number): Promise<void> {
    await db.query(
      `UPDATE savings_accounts SET balance_minor = $2, updated_at = now()
       WHERE character_id = $1`,
      [characterId, balanceMinor],
    );
  }

  async updateCreditScore(db: Db, characterId: string, score: number): Promise<void> {
    await db.query(`UPDATE characters SET credit_score = $2, updated_at = now() WHERE id = $1`, [
      characterId,
      score,
    ]);
  }

  async recordCreditEvent(db: Db, characterId: string, kind: string, delta: number): Promise<void> {
    await db.query(
      `INSERT INTO credit_events (id, character_id, kind, delta)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [characterId, kind, delta],
    );
  }

  async baseRate(db: Db): Promise<number> {
    const result = await db.query<{ macro: { baseRatePct?: number } }>(
      `SELECT macro FROM game_state WHERE id = 1`,
    );
    return Number(result.rows[0]?.macro?.baseRatePct ?? 5);
  }

  /** Collateral is a banking concern: only an owned, unencumbered property counts. */
  async collateralValue(db: Db, characterId: string, propertyId: string): Promise<number | null> {
    const result = await db.query<{ current_value_minor: string }>(
      `SELECT p.current_value_minor
       FROM properties p
       WHERE p.id = $1 AND p.owner_character_id = $2 AND p.status = 'owned'
       LIMIT 1`,
      [propertyId, characterId],
    );
    const row = result.rows[0];
    return row ? Number(row.current_value_minor) : null;
  }
}
