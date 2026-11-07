import type { BankingOverviewDto, LoanDto, Money, SavingsAccountDto } from '@efls/contracts';
import {
  accrueSimpleInterest,
  calculateCreditScore,
  creditBand,
  monthlyPayment,
  recommendedInterestRate,
  type CreditProfile,
} from '@efls/domain';
import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction, type Db } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_BANK_ID } from '../../shared/ledger/ledger.service.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';
import { notify } from '../notifications/notification.service.js';
import { BankingRepository, type LoanRow, type SavingsRow } from './banking.repository.js';

const DAY_MS = 86_400_000;
const MAX_LOAN_MINOR = 200_000_000;

function money(amount: number): Money {
  return { amount, currency: 'USD' };
}

function toLoanDto(row: LoanRow): LoanDto {
  return {
    id: row.id,
    borrowerId: row.borrower_id,
    lenderType: row.lender_type,
    principal: money(toMinor(row.principal_minor)),
    outstanding: money(toMinor(row.outstanding_minor)),
    interestRatePct: Number(row.interest_rate_pct),
    termMonths: row.term_months,
    monthlyPayment: money(toMinor(row.monthly_payment_minor)),
    nextDueAt: row.status === 'repaid' ? null : row.next_due_at.toISOString(),
    gracePeriodEnd: row.grace_period_end.toISOString(),
    collateralPropertyId: row.collateral_property_id,
    status: row.status,
  };
}

function toSavingsDto(row: SavingsRow, interestEarned: number) {
  return {
    id: row.id,
    characterId: row.character_id,
    balance: money(toMinor(row.balance_minor)),
    annualRatePct: Number(row.annual_rate_pct),
    interestEarned: money(interestEarned),
  };
}

export class BankingService {
  constructor(private readonly repository: BankingRepository = new BankingRepository()) {}

  /** Recompute the deterministic credit score inside the caller's transaction. */
  private async recomputeCredit(db: Db, characterId: string): Promise<number> {
    const stats = await this.repository.paymentStats(db, characterId);
    const salary = await this.repository.activeSalary(db, characterId);
    const debtService = await this.repository.monthlyDebtService(db, characterId);

    const accountAgeMonths = stats.oldestLoan
      ? Math.max(0, Math.round((Date.now() - stats.oldestLoan.getTime()) / (DAY_MS * 30)))
      : 0;

    const profile: CreditProfile = {
      onTimePayments: stats.onTime,
      latePayments: stats.late,
      defaults: stats.defaults,
      debtToIncomeRatio: salary > 0 ? Math.min(1, debtService / salary) : debtService > 0 ? 1 : 0,
      accountAgeMonths,
      bankruptcies: 0,
    };

    const score = calculateCreditScore(profile);
    await this.repository.updateCreditScore(db, characterId, score);
    return score;
  }

  async getOverview(userId: string): Promise<BankingOverviewDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const [loans, savingsRow, debt, salary] = await Promise.all([
      this.repository.listLoans(character.id),
      this.repository.ensureSavingsAccount(db, character.id),
      this.repository.totalDebt(db, character.id),
      this.repository.activeSalary(db, character.id),
    ]);

    const cash = toMinor(character.cash_minor);
    const savings = toMinor(savingsRow.balance_minor);
    const score = character.credit_score;

    const scoreFactor = 1 + ((score - 300) / 550) * 3;
    const borrowingBase = salary > 0 ? salary * 24 * scoreFactor : cash * scoreFactor;
    const maxLoanAmount = Math.min(MAX_LOAN_MINOR, Math.max(0, Math.round(borrowingBase)));

    const daysSinceOpened = Math.max(
      0,
      Math.floor((Date.now() - savingsRow.opened_at.getTime()) / DAY_MS),
    );
    const savingsInterestEarned = accrueSimpleInterest({
      principalMinor: savings,
      annualRatePct: Number(savingsRow.annual_rate_pct),
      days: daysSinceOpened,
    });

    return {
      characterId: character.id,
      cash: money(cash),
      savings: money(savings),
      totalDebt: money(debt),
      netWorth: money(cash + savings - debt),
      creditScore: score,
      creditBand: creditBand(score),
      maxLoanAmount: money(maxLoanAmount),
      loans: loans.map(toLoanDto),
      savingsAccount: toSavingsDto(savingsRow, savingsInterestEarned),
    };
  }

  async applyLoan(
    userId: string,
    input: { amountMinor: number; termMonths: number; collateralPropertyId?: string },
  ): Promise<LoanDto> {
    if (input.amountMinor <= 0) throw AppError.badRequest('Loan amount must be positive');

    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const baseRate = await this.repository.baseRate(client);
      const rate = recommendedInterestRate(character.credit_score, baseRate);

      const salary = await this.repository.activeSalary(client, character.id);
      const cash = toMinor(character.cash_minor);
      const scoreFactor = 1 + ((character.credit_score - 300) / 550) * 3;
      const borrowingBase = salary > 0 ? salary * 24 * scoreFactor : cash * scoreFactor;
      const maxLoan = Math.min(MAX_LOAN_MINOR, Math.max(0, Math.round(borrowingBase)));
      if (input.amountMinor > maxLoan) {
        throw AppError.unprocessable(
          `Requested amount exceeds your credit limit of ${maxLoan} minor units`,
        );
      }

      let collateralValue = 0;
      if (input.collateralPropertyId) {
        const value = await this.repository.collateralValue(
          client,
          character.id,
          input.collateralPropertyId,
        );
        if (value === null) {
          throw AppError.unprocessable('Collateral property must be owned and unencumbered');
        }
        collateralValue = value;
        if (input.amountMinor > collateralValue * 0.8) {
          throw AppError.unprocessable('Loan exceeds 80% of the collateral value');
        }
      }

      const payment = monthlyPayment({
        principalMinor: input.amountMinor,
        annualRatePct: rate,
        termMonths: input.termMonths,
      });
      const nextDue = new Date(Date.now() + 30 * DAY_MS);

      const loan = await this.repository.createLoan(client, {
        borrowerId: character.id,
        principalMinor: input.amountMinor,
        interestRatePct: rate,
        termMonths: input.termMonths,
        monthlyPaymentMinor: payment,
        nextDueAt: nextDue,
        gracePeriodEnd: nextDue,
        collateralPropertyId: input.collateralPropertyId ?? null,
      });

      await ledger.transfer(client, {
        from: { ownerType: 'bank', ownerId: SYSTEM_BANK_ID },
        to: { ownerType: 'character', ownerId: character.id },
        amountMinor: input.amountMinor,
        kind: 'loan_disbursement',
        description: `Loan disbursement ${loan.id}`,
        referenceType: 'loan',
        referenceId: loan.id,
      });

      await enqueueDomainEvent(client, {
        type: 'loan.opened.v1',
        aggregateType: 'loan',
        aggregateId: loan.id,
        payload: {
          loanId: loan.id,
          borrowerId: character.id,
          amountMinor: input.amountMinor,
          interestRatePct: rate,
          termMonths: input.termMonths,
        },
      });

      await notify(client, {
        userId,
        kind: 'banking',
        title: 'Khoản vay đã được giải ngân',
        body: `Bạn vừa vay ${(input.amountMinor / 100).toLocaleString('vi-VN')} USD với lãi suất ${rate}%/năm.`,
        payload: { loanId: loan.id },
      });

      await this.recomputeCredit(client, character.id);
      return toLoanDto(loan);
    });
  }

  async repayLoan(userId: string, loanId: string, amountMinor: number): Promise<LoanDto> {
    if (amountMinor <= 0) throw AppError.badRequest('Repayment amount must be positive');

    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const loan = await this.repository.findLoan(loanId, character.id);
      if (!loan) throw AppError.notFound('Loan');
      if (loan.status === 'repaid')
        throw AppError.conflict('loan_repaid', 'Loan is already repaid');

      const outstanding = toMinor(loan.outstanding_minor);
      const payment = Math.min(amountMinor, outstanding);
      if (payment <= 0) throw AppError.badRequest('Nothing left to repay');

      const lastPayment = await client.query<{ paid_at: Date | null }>(
        `SELECT MAX(paid_at) AS paid_at FROM loan_payments WHERE loan_id = $1`,
        [loanId],
      );
      const since = lastPayment.rows[0]?.paid_at ?? loan.created_at;
      const days = Math.max(0, Math.floor((Date.now() - since.getTime()) / DAY_MS));
      const accruedInterest = accrueSimpleInterest({
        principalMinor: outstanding,
        annualRatePct: Number(loan.interest_rate_pct),
        days,
      });

      const interestPaid = Math.min(payment, accruedInterest);
      const principalPaid = payment - interestPaid;
      const remaining = outstanding - principalPaid;

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'bank', ownerId: SYSTEM_BANK_ID },
        amountMinor: payment,
        kind: 'loan_repayment',
        description: `Loan repayment ${loan.id}`,
        referenceType: 'loan',
        referenceId: loan.id,
      });

      await this.repository.insertPayment(client, {
        loanId,
        amountMinor: payment,
        principalMinor: principalPaid,
        interestMinor: interestPaid,
        onTime: new Date() <= loan.next_due_at,
      });

      const status = remaining <= 0 ? 'repaid' : 'active';
      await this.repository.updateLoanAfterPayment(
        client,
        loanId,
        Math.max(0, remaining),
        status,
        status === 'repaid' ? null : new Date(Date.now() + 30 * DAY_MS),
      );

      await this.repository.recordCreditEvent(client, character.id, 'loan_payment', 5);

      if (status === 'repaid') {
        await enqueueDomainEvent(client, {
          type: 'loan.repaid.v1',
          aggregateType: 'loan',
          aggregateId: loanId,
          payload: { loanId, borrowerId: character.id },
        });
        await notify(client, {
          userId,
          kind: 'banking',
          title: 'Đã tất toán khoản vay',
          body: 'Bạn đã trả hết khoản vay. Điểm tín dụng được cập nhật.',
          payload: { loanId },
        });
      }

      await this.recomputeCredit(client, character.id);
      const updated = await this.repository.findLoan(loanId, character.id, client);
      if (!updated) throw new Error('Loan disappeared during repayment');
      return toLoanDto(updated);
    });
  }

  async depositSavings(userId: string, amountMinor: number): Promise<SavingsAccountDto> {
    if (amountMinor <= 0) throw AppError.badRequest('Deposit must be positive');
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const savings = await this.repository.ensureSavingsAccount(client, character.id);

      await ledger.post(client, {
        kind: 'savings_deposit',
        description: `Savings deposit ${character.id}`,
        referenceType: 'savings',
        referenceId: savings.id,
        legs: [
          { ownerType: 'character', ownerId: character.id, kind: 'cash', deltaMinor: -amountMinor },
          {
            ownerType: 'character',
            ownerId: character.id,
            kind: 'savings',
            deltaMinor: amountMinor,
          },
        ],
      });

      const balance = toMinor(savings.balance_minor) + amountMinor;
      await this.repository.setSavingsBalance(client, character.id, balance);
      return {
        id: savings.id,
        characterId: savings.character_id,
        balance: money(balance),
        annualRatePct: Number(savings.annual_rate_pct),
        interestEarned: money(0),
      };
    });
  }

  async withdrawSavings(userId: string, amountMinor: number): Promise<SavingsAccountDto> {
    if (amountMinor <= 0) throw AppError.badRequest('Withdrawal must be positive');
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const savings = await this.repository.ensureSavingsAccount(client, character.id);
      if (toMinor(savings.balance_minor) < amountMinor) {
        throw AppError.conflict('insufficient_savings', 'Not enough savings balance');
      }

      await ledger.post(client, {
        kind: 'savings_withdrawal',
        description: `Savings withdrawal ${character.id}`,
        referenceType: 'savings',
        referenceId: savings.id,
        legs: [
          {
            ownerType: 'character',
            ownerId: character.id,
            kind: 'savings',
            deltaMinor: -amountMinor,
          },
          { ownerType: 'character', ownerId: character.id, kind: 'cash', deltaMinor: amountMinor },
        ],
      });

      const balance = toMinor(savings.balance_minor) - amountMinor;
      await this.repository.setSavingsBalance(client, character.id, balance);
      return {
        id: savings.id,
        characterId: savings.character_id,
        balance: money(balance),
        annualRatePct: Number(savings.annual_rate_pct),
        interestEarned: money(0),
      };
    });
  }

  async getLoan(userId: string, loanId: string): Promise<LoanDto> {
    const character = await requireCharacterByUserId(this.repository.db, userId);
    const loan = await this.repository.findLoan(loanId, character.id);
    if (!loan) throw AppError.notFound('Loan');
    return toLoanDto(loan);
  }
}
