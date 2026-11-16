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
  collateral_type: 'property' | 'company' | null;
  collateral_property_id: string | null;
  collateral_company_id: string | null;
  collateral_property_type: string | null;
  collateral_property_value_minor: string | null;
  collateral_node_name: string | null;
  collateral_property_status: string | null;
  collateral_company_name: string | null;
  collateral_company_industry: string | null;
  collateral_company_value_minor: string | null;
  collateral_company_status: string | null;
  created_at: Date;
}

export interface SavingsRow {
  id: string;
  character_id: string;
  balance_minor: string;
  annual_rate_pct: string;
  opened_at: Date;
}

export interface SavingsDepositRow {
  id: string;
  character_id: string;
  principal_minor: string;
  balance_minor: string;
  term_months: number;
  annual_rate_pct: string;
  status: 'active' | 'closed';
  opened_at: Date;
  matures_at: Date | null;
  closed_at: Date | null;
}

export interface SavingsTermRow {
  term_months: number;
  annual_rate_pct: string;
  early_withdraw_penalty_pct: string;
  label: string;
}

export interface CreateLoanInput {
  borrowerId: string;
  principalMinor: number;
  interestRatePct: number;
  termMonths: number;
  monthlyPaymentMinor: number;
  gracePeriodEnd: Date;
  nextDueAt: Date;
  collateralType: 'property' | 'company' | null;
  collateralPropertyId: string | null;
  collateralCompanyId: string | null;
}

export class BankingRepository {
  constructor(readonly db: Db = pool) {}

  private loanSelect(alias = 'l') {
    return `
      ${alias}.id, ${alias}.borrower_id, ${alias}.lender_type, ${alias}.principal_minor, ${alias}.outstanding_minor,
      ${alias}.interest_rate_pct, ${alias}.term_months, ${alias}.monthly_payment_minor, ${alias}.next_due_at,
      ${alias}.grace_period_end, ${alias}.status, ${alias}.created_at,
      COALESCE(${alias}.collateral_type, CASE WHEN ${alias}.collateral_property_id IS NOT NULL THEN 'property' WHEN ${alias}.collateral_company_id IS NOT NULL THEN 'company' ELSE NULL END) AS collateral_type,
      ${alias}.collateral_property_id,
      ${alias}.collateral_company_id,
      p.property_type AS collateral_property_type,
      p.current_value_minor AS collateral_property_value_minor,
      n.name AS collateral_node_name,
      p.status AS collateral_property_status,
      c.name AS collateral_company_name,
      c.industry AS collateral_company_industry,
      effective_company_valuation(c.id) AS collateral_company_value_minor,
      c.status AS collateral_company_status
    `;
  }

  private loanJoins(alias = 'l') {
    return `
      LEFT JOIN properties p ON p.id = ${alias}.collateral_property_id
      LEFT JOIN map_nodes n ON n.id = p.node_id
      LEFT JOIN companies c ON c.id = ${alias}.collateral_company_id
    `;
  }

  async listLoans(characterId: string): Promise<LoanRow[]> {
    const result = await this.db.query<LoanRow>(
      `SELECT ${this.loanSelect('l')}
       FROM loans l
       ${this.loanJoins('l')}
       WHERE l.borrower_id = $1
       ORDER BY CASE WHEN l.status = 'repaid' THEN 1 ELSE 0 END, l.created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async findLoan(loanId: string, characterId: string, db: Db = this.db): Promise<LoanRow | null> {
    const result = await db.query<LoanRow>(
      `SELECT ${this.loanSelect('l')}
       FROM loans l
       ${this.loanJoins('l')}
       WHERE l.id = $1 AND l.borrower_id = $2
       LIMIT 1`,
      [loanId, characterId],
    );
    return result.rows[0] ?? null;
  }

  async createLoan(db: Db, input: CreateLoanInput): Promise<LoanRow> {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO loans
         (id, borrower_id, lender_type, principal_minor, outstanding_minor,
          interest_rate_pct, term_months, monthly_payment_minor, next_due_at,
          grace_period_end, status, collateral_type, collateral_property_id, collateral_company_id)
       VALUES (gen_random_uuid(), $1, 'bank', $2, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10)
       RETURNING id`,
      [
        input.borrowerId,
        input.principalMinor,
        input.interestRatePct,
        input.termMonths,
        input.monthlyPaymentMinor,
        input.nextDueAt,
        input.gracePeriodEnd,
        input.collateralType,
        input.collateralPropertyId,
        input.collateralCompanyId,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('Loan insert returned no row');
    const row = await this.findLoan(id, input.borrowerId, db);
    if (!row) throw new Error('Loan disappeared after insert');
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

  async syncSavingsAggregate(db: Db, characterId: string): Promise<number> {
    const total = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(balance_minor),0)::bigint AS total
       FROM savings_deposits WHERE character_id = $1 AND status = 'active'`,
      [characterId],
    );
    const sum = Number(total.rows[0]?.total ?? 0);
    await this.ensureSavingsAccount(db, characterId);
    await this.setSavingsBalance(db, characterId, sum);
    return sum;
  }

  async listSavingsTerms(db: Db = this.db): Promise<SavingsTermRow[]> {
    const r = await db.query<SavingsTermRow>(
      `SELECT term_months, annual_rate_pct, early_withdraw_penalty_pct, label
       FROM savings_rate_config ORDER BY term_months ASC`,
    );
    return r.rows;
  }

  async getSavingsTerm(db: Db, termMonths: number): Promise<SavingsTermRow | null> {
    const r = await db.query<SavingsTermRow>(
      `SELECT term_months, annual_rate_pct, early_withdraw_penalty_pct, label
       FROM savings_rate_config WHERE term_months = $1`,
      [termMonths],
    );
    return r.rows[0] ?? null;
  }

  async listSavingsDeposits(characterId: string, db: Db = this.db): Promise<SavingsDepositRow[]> {
    const r = await db.query<SavingsDepositRow>(
      `SELECT id, character_id, principal_minor, balance_minor, term_months,
              annual_rate_pct, status, opened_at, matures_at, closed_at
       FROM savings_deposits
       WHERE character_id = $1
       ORDER BY opened_at DESC`,
      [characterId],
    );
    return r.rows;
  }

  async listAccountHistory(
    db: Db,
    characterId: string,
    limit = 30,
  ): Promise<Array<{
    id: string;
    transaction_id: string;
    account_kind: 'cash' | 'savings';
    delta_minor: string;
    kind: string;
    description: string;
    reference_type: string | null;
    reference_id: string | null;
    created_at: Date;
  }>> {
    const safeLimit = Math.max(1, Math.min(30, Math.trunc(limit || 30)));
    const r = await db.query<{
      id: string;
      transaction_id: string;
      account_kind: 'cash' | 'savings';
      delta_minor: string;
      kind: string;
      description: string;
      reference_type: string | null;
      reference_id: string | null;
      created_at: Date;
    }>(
      `SELECT e.id, e.transaction_id, a.kind AS account_kind, e.delta_minor::text AS delta_minor,
              t.kind, t.description, t.reference_type, t.reference_id, e.created_at
       FROM ledger_entries e
       JOIN ledger_transactions t ON t.id = e.transaction_id
       JOIN ledger_accounts a ON a.id = e.account_id
       WHERE a.owner_type = 'character' AND a.owner_id = $1 AND a.kind IN ('cash','savings')
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT $2`,
      [characterId, safeLimit],
    );
    return r.rows;
  }

  async findSavingsDeposit(
    db: Db,
    characterId: string,
    depositId: string,
  ): Promise<SavingsDepositRow | null> {
    const r = await db.query<SavingsDepositRow>(
      `SELECT id, character_id, principal_minor, balance_minor, term_months,
              annual_rate_pct, status, opened_at, matures_at, closed_at
       FROM savings_deposits
       WHERE id = $1 AND character_id = $2`,
      [depositId, characterId],
    );
    return r.rows[0] ?? null;
  }

  async createSavingsDeposit(
    db: Db,
    input: {
      characterId: string;
      amountMinor: number;
      termMonths: number;
      annualRatePct: number;
    },
  ): Promise<SavingsDepositRow> {
    // Chuẩn thời gian: 1 tháng game = 30 ngày game = 30 phút thực
    const GAME_MONTH_MS = 30 * 60 * 1000;
    const maturesAt =
      input.termMonths > 0
        ? new Date(Date.now() + input.termMonths * GAME_MONTH_MS)
        : null;
    const r = await db.query<SavingsDepositRow>(
      `INSERT INTO savings_deposits
         (id, character_id, principal_minor, balance_minor, term_months, annual_rate_pct, status, matures_at)
       VALUES (gen_random_uuid(), $1, $2, $2, $3, $4, 'active', $5)
       RETURNING id, character_id, principal_minor, balance_minor, term_months,
                 annual_rate_pct, status, opened_at, matures_at, closed_at`,
      [input.characterId, input.amountMinor, input.termMonths, input.annualRatePct, maturesAt],
    );
    return r.rows[0]!;
  }

  async updateSavingsDeposit(
    db: Db,
    depositId: string,
    balanceMinor: number,
    status: 'active' | 'closed',
  ): Promise<void> {
    await db.query(
      `UPDATE savings_deposits
       SET balance_minor = $2, status = $3,
           closed_at = CASE WHEN $3 = 'closed' THEN now() ELSE closed_at END,
           updated_at = now()
       WHERE id = $1`,
      [depositId, balanceMinor, status],
    );
  }

  async rolloverSavingsDeposit(
    db: Db,
    input: {
      depositId: string;
      principalMinor: number;
      balanceMinor: number;
      openedAt: Date;
      maturesAt: Date | null;
    },
  ): Promise<void> {
    await db.query(
      `UPDATE savings_deposits
       SET principal_minor = $2,
           balance_minor = $3,
           opened_at = $4,
           matures_at = $5,
           updated_at = now()
       WHERE id = $1`,
      [input.depositId, input.principalMinor, input.balanceMinor, input.openedAt, input.maturesAt],
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

  async companyCollateralValue(db: Db, characterId: string, companyId: string): Promise<number | null> {
    const result = await db.query<{ valuation_minor: string }>(
      `SELECT effective_company_valuation(c.id) AS valuation_minor FROM companies c
       WHERE c.id = $1 AND c.owner_character_id = $2 AND c.status <> 'bankrupt'
       LIMIT 1`,
      [companyId, characterId],
    );
    const row = result.rows[0];
    return row ? Number(row.valuation_minor) : null;
  }

  async isCollateralEncumbered(db: Db, kind: 'property' | 'company', assetId: string): Promise<boolean> {
    if (kind === 'property') {
      const r = await db.query<{ ok: number }>(
        `SELECT 1 AS ok
         FROM loans
         WHERE collateral_property_id = $1 AND status IN ('active','grace','defaulted')
         LIMIT 1`,
        [assetId],
      );
      return r.rows.length > 0;
    }
    const r = await db.query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM loans
       WHERE collateral_company_id = $1 AND status IN ('active','grace','defaulted')
       LIMIT 1`,
      [assetId],
    );
    return r.rows.length > 0;
  }

  async getOwnedRealEstateValue(db: Db, characterId: string): Promise<number> {
    const core = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(p.current_value_minor), 0)::bigint AS total
       FROM properties p
       WHERE p.owner_character_id = $1 AND p.status IN ('owned','listed')`,
      [characterId],
    );
    let province = { rows: [{ total: '0' }] } as { rows: Array<{ total: string }> };
    try {
      province = await db.query<{ total: string }>(
        `SELECT COALESCE(SUM(pl.current_value_minor), 0)::bigint AS total
         FROM province_land_properties pl
         WHERE pl.owner_character_id = $1 AND pl.status IN ('owned')`,
        [characterId],
      );
    } catch {
      // bảng có thể chưa tồn tại ở môi trường cũ; bỏ qua để không chặn
    }
    return Number(core.rows[0]?.total ?? 0) + Number(province.rows[0]?.total ?? 0);
  }

  async getOwnedCompanyValue(db: Db, characterId: string): Promise<number> {
    const r = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(effective_company_valuation(c.id)), 0)::bigint AS total FROM companies c
       WHERE c.owner_character_id = $1 AND c.status <> 'bankrupt'`,
      [characterId],
    );
    return Number(r.rows[0]?.total ?? 0);
  }

  async listCollateralPropertyOptions(db: Db, characterId: string): Promise<Array<{ id: string; name: string; valueMinor: number; subtitle: string | null }>> {
    // Chỉ lô gốc (không lấy lô thành viên đã gộp/hợp thửa) để tránh trùng thế chấp
    const r = await db.query<{ id: string; name: string; value_minor: string; subtitle: string | null }>(
      `SELECT p.id,
              COALESCE(n.name, 'Bất động sản') AS name,
              p.current_value_minor AS value_minor,
              n.name AS subtitle
       FROM properties p
       LEFT JOIN map_nodes n ON n.id = p.node_id
       WHERE p.owner_character_id = $1
         AND p.status = 'owned'
         AND p.merged_into_property_id IS NULL
       ORDER BY p.current_value_minor DESC`,
      [characterId],
    );
    return r.rows.map((x) => ({ id: x.id, name: x.name, valueMinor: Number(x.value_minor), subtitle: x.subtitle }));
  }

  async listCollateralCompanyOptions(db: Db, characterId: string): Promise<Array<{ id: string; name: string; valueMinor: number; subtitle: string | null }>> {
    const r = await db.query<{ id: string; name: string; value_minor: string; subtitle: string | null }>(
      `SELECT c.id, c.name, effective_company_valuation(c.id) AS value_minor, c.industry AS subtitle
       FROM companies c
       WHERE c.owner_character_id = $1 AND c.status <> 'bankrupt'
       ORDER BY effective_company_valuation(c.id) DESC`,
      [characterId],
    );
    return r.rows.map((x) => ({ id: x.id, name: x.name, valueMinor: Number(x.value_minor), subtitle: x.subtitle }));
  }

  async insertTransfer(
    db: Db,
    input: {
      fromCharacterId: string;
      toCharacterId: string;
      fromAccountNumber: string;
      toAccountNumber: string;
      amountMinor: number;
      message: string;
      status: 'completed' | 'failed';
      ledgerTransactionId: string | null;
    },
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO bank_transfers
         (id, from_character_id, to_character_id, from_account_number, to_account_number,
          amount_minor, message, status, ledger_transaction_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        input.fromCharacterId,
        input.toCharacterId,
        input.fromAccountNumber,
        input.toAccountNumber,
        input.amountMinor,
        input.message,
        input.status,
        input.ledgerTransactionId,
      ],
    );
    return r.rows[0]!.id;
  }

  async listTransfers(
    characterId: string,
    db: Db = this.db,
  ): Promise<
    Array<{
      id: string;
      direction: 'in' | 'out';
      counterparty_account_number: string;
      counterparty_name: string;
      amount_minor: string;
      message: string;
      status: 'completed' | 'failed';
      created_at: Date;
    }>
  > {
    const r = await db.query<{
      id: string;
      direction: 'in' | 'out';
      counterparty_account_number: string;
      counterparty_name: string;
      amount_minor: string;
      message: string;
      status: 'completed' | 'failed';
      created_at: Date;
    }>(
      `SELECT
         t.id,
         CASE WHEN t.from_character_id = $1 THEN 'out' ELSE 'in' END AS direction,
         CASE WHEN t.from_character_id = $1 THEN t.to_account_number ELSE t.from_account_number END AS counterparty_account_number,
         CASE WHEN t.from_character_id = $1 THEN tc.full_name ELSE fc.full_name END AS counterparty_name,
         t.amount_minor,
         t.message,
         t.status,
         t.created_at
       FROM bank_transfers t
       JOIN characters fc ON fc.id = t.from_character_id
       JOIN characters tc ON tc.id = t.to_character_id
       WHERE t.from_character_id = $1 OR t.to_character_id = $1
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [characterId],
    );
    return r.rows;
  }
}

