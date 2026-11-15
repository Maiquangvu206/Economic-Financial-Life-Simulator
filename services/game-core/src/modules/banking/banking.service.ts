import type { BankingOverviewDto, LoanDto, Money } from '@efls/contracts';
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
import { requireCharacterByUserId, requireLivingCharacterByUserId, resolveCharacterByCccd } from '../../shared/actors/character.js';
import { maskCccd } from '@efls/domain';
import { ledger, SYSTEM_BANK_ID } from '../../shared/ledger/ledger.service.js';
import { enqueueDomainEvent } from '../../shared/events/eventBus.js';
import { notify } from '../notifications/notification.service.js';
import { publishToUser } from '../../shared/realtime/publish.js';
import { assertNoPendingDivorce } from '../social/social.freeze.js';
import { accountTierLabel, resolveAccountTier } from '../../shared/banking/accountTier.js';
import { CharactersRepository } from '../characters/characters.repository.js';
import {
  BankingRepository,
  type LoanRow,
  type SavingsDepositRow,
  type SavingsRow,
  type SavingsTermRow,
} from './banking.repository.js';

const DAY_MS = 86_400_000;
const MAX_LOAN_MINOR = 2_000_000_000; // trần hệ thống an toàn
const PROPERTY_LTV_PCT = 80;
const COMPANY_LTV_PCT = 70;

function scoreFactorFromCredit(score: number): number {
  const clamped = Math.max(300, Math.min(850, Number(score) || 300));
  return 0.6 + ((clamped - 300) / 550) * 1.8; // ~0.6x .. ~2.4x
}

function money(amount: number): Money {
  return { amount, currency: 'VND' };
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Căn hộ',
  house: 'Nhà',
  office: 'Văn phòng',
  warehouse: 'Kho bãi',
  port_berth: 'Bến cảng',
  land: 'Đất',
};

function toLoanDto(row: LoanRow): LoanDto {
  const collateralType = (row as any).collateral_type as 'property' | 'company' | null;
  let collateral: LoanDto['collateral'] = null;
  if (collateralType === 'property' && row.collateral_property_id) {
    collateral = {
      kind: 'property',
      propertyId: row.collateral_property_id,
      propertyType:
        PROPERTY_TYPE_LABELS[row.collateral_property_type ?? ''] ?? (row.collateral_property_type ?? 'Bất động sản'),
      nodeName: row.collateral_node_name ?? null,
      status: row.collateral_property_status ?? 'unknown',
      companyId: null,
      companyName: null,
      companyIndustry: null,
      currentValue: money(toMinor((row as any).collateral_property_value_minor ?? '0')),
    };
  } else if (collateralType === 'company' && (row as any).collateral_company_id) {
    collateral = {
      kind: 'company',
      propertyId: null,
      propertyType: null,
      nodeName: null,
      status: (row as any).collateral_company_status ?? 'unknown',
      companyId: (row as any).collateral_company_id,
      companyName: (row as any).collateral_company_name ?? 'Công ty',
      companyIndustry: (row as any).collateral_company_industry ?? null,
      currentValue: money(toMinor((row as any).collateral_company_value_minor ?? '0')),
    };
  }

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
    collateralType: collateralType ?? null,
    collateralPropertyId: row.collateral_property_id ?? null,
    collateralCompanyId: (row as any).collateral_company_id ?? null,
    collateral,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

function depositInterest(row: SavingsDepositRow, term: SavingsTermRow | null, now = Date.now()): number {
  const days = Math.max(0, Math.floor((now - row.opened_at.getTime()) / DAY_MS));
  const gross = accrueSimpleInterest({
    principalMinor: toMinor(row.balance_minor),
    annualRatePct: Number(row.annual_rate_pct),
    days,
  });
  if (row.term_months <= 0 || !row.matures_at) return gross;
  if (now >= row.matures_at.getTime()) return gross;
  // Rút trước hạn: phạt theo cấu hình (giảm phần lãi).
  const penaltyPct = Number(term?.early_withdraw_penalty_pct ?? 0);
  const kept = Math.max(0, 1 - penaltyPct / 100);
  return Math.floor(gross * kept);
}

export class BankingService {
  constructor(
    private readonly repository: BankingRepository = new BankingRepository(),
    private readonly charactersRepository: CharactersRepository = new CharactersRepository(),
  ) {}

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
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      await this.rolloverMaturedSavings(client, character.id);
      await this.capitalizeOverdueLoanInterest(client, { ...character, user_id: (character.user_id ?? (userId as any)) } as any);

      const [loans, savingsRow, debt, deposits, terms, baseRate, realEstateValue, companyValue, propOptions, companyOptions] = await Promise.all([
        this.repository.listLoans(character.id),
        this.repository.ensureSavingsAccount(client, character.id),
        this.repository.totalDebt(client, character.id),
        this.repository.listSavingsDeposits(character.id, client),
        this.repository.listSavingsTerms(client),
        this.repository.baseRate(client),
        this.repository.getOwnedRealEstateValue(client, character.id),
        this.repository.getOwnedCompanyValue(client, character.id),
        this.repository.listCollateralPropertyOptions(client, character.id),
        this.repository.listCollateralCompanyOptions(client, character.id),
      ]);

      const termMap = new Map(terms.map((t) => [Number(t.term_months), t]));
      const activeDeposits = deposits.filter((d) => d.status === 'active');
      const savingsTotal = activeDeposits.reduce((s, d) => s + toMinor(d.balance_minor), 0);
      await this.repository.syncSavingsAggregate(client, character.id);
      const sortedActiveDeposits = [...activeDeposits].sort(
        (a, b) => b.opened_at.getTime() - a.opened_at.getTime(),
      );

      const cash = toMinor(character.cash_minor);
      const score = character.credit_score;
      const sf = scoreFactorFromCredit(score);
      const assetBase = cash + savingsTotal + realEstateValue + companyValue;
      // Hạn mức tín dụng (không/ít thế chấp) dựa trên điểm tín dụng + tiền mặt + tiết kiệm + BĐS + công ty
      const unsecuredLimit = Math.min(MAX_LOAN_MINOR, Math.max(0, Math.round(assetBase * sf * 0.4)));

      const collateralOptions = await Promise.all([
        ...propOptions.map(async (p) => {
          const encumbered = await this.repository.isCollateralEncumbered(client, 'property', p.id);
          const maxByLtv = Math.round(p.valueMinor * (PROPERTY_LTV_PCT / 100));
          return {
            kind: 'property' as const,
            id: p.id,
            name: p.name,
            value: money(p.valueMinor),
            ltvPct: PROPERTY_LTV_PCT,
            maxLoanAmount: money(Math.min(MAX_LOAN_MINOR, maxByLtv)),
            subtitle: p.subtitle,
            encumbered,
          };
        }),
        ...companyOptions.map(async (c) => {
          const encumbered = await this.repository.isCollateralEncumbered(client, 'company', c.id);
          const maxByLtv = Math.round(c.valueMinor * (COMPANY_LTV_PCT / 100));
          return {
            kind: 'company' as const,
            id: c.id,
            name: c.name,
            value: money(c.valueMinor),
            ltvPct: COMPANY_LTV_PCT,
            maxLoanAmount: money(Math.min(MAX_LOAN_MINOR, maxByLtv)),
            subtitle: c.subtitle,
            encumbered,
          };
        }),
      ]);
      const bestSecured = collateralOptions
        .filter((o) => !o.encumbered)
        .reduce((m, o) => Math.max(m, o.maxLoanAmount.amount), 0);
      const maxLoanAmount = Math.min(MAX_LOAN_MINOR, Math.max(unsecuredLimit, bestSecured));

      const daysSinceOpened = Math.max(
        0,
        Math.floor((Date.now() - savingsRow.opened_at.getTime()) / DAY_MS),
      );
      const savingsInterestEarned = accrueSimpleInterest({
        principalMinor: savingsTotal,
        annualRatePct: Number(savingsRow.annual_rate_pct),
        days: daysSinceOpened,
      });

      const activeLoans = loans.filter((l) => l.status !== 'repaid');
      return {
        characterId: character.id,
        cash: money(cash),
        savings: money(savingsTotal),
        totalDebt: money(debt),
        netWorth: money(cash + savingsTotal - debt),
        creditScore: score,
        creditBand: creditBand(score),
        baseRatePct: baseRate,
        maxLoanAmount: money(maxLoanAmount),
        loanLimit: {
          cash: money(cash),
          savings: money(savingsTotal),
          realEstate: money(realEstateValue),
          companies: money(companyValue),
          assetBase: money(assetBase),
          creditScore: score,
          scoreFactor: Math.round(sf * 1000) / 1000,
          unsecuredLimit: money(unsecuredLimit),
          maxLoanAmount: money(maxLoanAmount),
        },
        collateralOptions,
        loans: activeLoans.map(toLoanDto),
        savingsAccount: {
          id: savingsRow.id,
          characterId: savingsRow.character_id,
          balance: money(savingsTotal),
          annualRatePct: Number(savingsRow.annual_rate_pct),
          interestEarned: money(savingsInterestEarned),
        },
        savingsDeposits: sortedActiveDeposits.map((d) => ({
          id: d.id,
          characterId: d.character_id,
          principal: money(toMinor(d.principal_minor)),
          balance: money(toMinor(d.balance_minor)),
          termMonths: Number(d.term_months),
          annualRatePct: Number(d.annual_rate_pct),
          status: d.status,
          openedAt: d.opened_at.toISOString(),
          maturesAt: d.matures_at ? d.matures_at.toISOString() : null,
          interestEarned: money(depositInterest(d, termMap.get(Number(d.term_months)) ?? null)),
        })),
        savingsTerms: terms.map((t) => ({
          termMonths: Number(t.term_months),
          annualRatePct: Number(t.annual_rate_pct),
          earlyWithdrawPenaltyPct: Number(t.early_withdraw_penalty_pct),
          label: t.label,
        })),
      };
    });
  }

  private monthMs(months: number): number {
    return months * 30 * DAY_MS;
  }

  private async rolloverMaturedSavings(client: Db, characterId: string): Promise<void> {
    const deposits = (await this.repository.listSavingsDeposits(characterId, client)).filter(
      (d) => d.status === 'active' && d.term_months > 0 && d.matures_at,
    );
    if (deposits.length === 0) return;

    const savings = await this.repository.ensureSavingsAccount(client, characterId);
    const now = Date.now();

    for (const d of deposits) {
      if (!d.matures_at) continue;
      let maturesAt = d.matures_at.getTime();
      if (maturesAt > now) continue;

      let balance = toMinor(d.balance_minor);
      let principal = toMinor(d.principal_minor);
      let openedAt = d.opened_at;
      let periods = 0;

      while (maturesAt <= now && periods < 120) {
        // Quay vòng gốc lãi: lãi kỳ nhập vào gốc và gia hạn tiếp kỳ hạn như cũ.
        const termInterest = Math.round(
          (balance * Number(d.annual_rate_pct)) / 100 * (Number(d.term_months) / 12),
        );
        if (termInterest > 0) {
          await ledger.post(client as any, {
            kind: 'savings_interest_rollover',
            description: `Savings rollover interest ${d.id}`,
            referenceType: 'savings_deposit',
            referenceId: d.id,
            legs: [
              { ownerType: 'character', ownerId: characterId, kind: 'savings', deltaMinor: termInterest },
              { ownerType: 'bank', ownerId: SYSTEM_BANK_ID, kind: 'cash', deltaMinor: -termInterest },
            ],
          });
        }
        balance += termInterest;
        principal = balance;
        openedAt = new Date(maturesAt);
        maturesAt = maturesAt + this.monthMs(Number(d.term_months));
        periods += 1;
      }

      if (periods > 0) {
        await this.repository.rolloverSavingsDeposit(client, {
          depositId: d.id,
          principalMinor: principal,
          balanceMinor: balance,
          openedAt,
          maturesAt: new Date(maturesAt),
        });
      }
    }

    await this.repository.syncSavingsAggregate(client, characterId);
  }

  private async capitalizeOverdueLoanInterest(
    client: Db,
    character: { id: string; user_id: string; credit_score: number },
  ): Promise<void> {
    const loans = (await this.repository.listLoans(character.id)).filter(
      (l) => l.status === 'active' || l.status === 'grace',
    );
    if (loans.length === 0) return;

    const now = Date.now();
    for (const loan of loans) {
      let nextDue = loan.next_due_at ? loan.next_due_at.getTime() : NaN;
      if (!Number.isFinite(nextDue)) continue;
      let outstanding = toMinor(loan.outstanding_minor);
      let monthly = toMinor(loan.monthly_payment_minor);
      let capitalizedPeriods = 0;

      // Quay vòng gốc lãi cho khoản vay: quá hạn -> cộng lãi vào gốc/dư nợ và hạ mức uy tín.
      while (nextDue <= now && capitalizedPeriods < 24 && outstanding > 0) {
        const monthlyRate = Number(loan.interest_rate_pct) / 100 / 12;
        const interest = Math.round(outstanding * monthlyRate);
        if (interest > 0) {
          outstanding += interest;
          monthly = monthlyPayment({
            principalMinor: outstanding,
            annualRatePct: Number(loan.interest_rate_pct),
            termMonths: Math.max(1, loan.term_months),
          });
        }
        nextDue = nextDue + this.monthMs(1);
        capitalizedPeriods += 1;
      }

      if (capitalizedPeriods > 0) {
        await client.query(
          `UPDATE loans
           SET outstanding_minor = $2,
               monthly_payment_minor = $3,
               next_due_at = $4,
               grace_period_end = $4,
               updated_at = now()
           WHERE id = $1`,
          [loan.id, outstanding, monthly, new Date(nextDue)],
        );

        const penalty = capitalizedPeriods * 10;
        const newScore = Math.max(300, character.credit_score - penalty);
        await this.repository.updateCreditScore(client, character.id, newScore);
        await this.repository.recordCreditEvent(
          client,
          character.id,
          'loan_interest_capitalized',
          -penalty,
        );
        character.credit_score = newScore;

        await notify(client as any, {
          userId: character.user_id,
          kind: 'banking',
          title: 'Quay vòng lãi khoản vay',
          body: `Khoản vay quá hạn đã được cộng lãi vào gốc (${capitalizedPeriods} kỳ). Điểm uy tín giảm ${penalty}.`,
          payload: { loanId: loan.id, periods: capitalizedPeriods, penalty },
        });
        await publishToUser(character.user_id, 'notification', {
          kind: 'warning',
          title: 'Quay vòng lãi khoản vay',
          body: `Lãi đã nhập gốc (${capitalizedPeriods} kỳ), điểm uy tín -${penalty}.`,
        });
      }
    }
  }

  async applyLoan(
    userId: string,
    input: { amountMinor: number; termMonths: number; collateralPropertyId?: string; collateralCompanyId?: string },
  ): Promise<LoanDto> {
    if (input.amountMinor <= 0) throw AppError.badRequest('Số tiền vay phải lớn hơn 0.');
    if (input.collateralPropertyId && input.collateralCompanyId) {
      throw AppError.badRequest('Chỉ được chọn một tài sản thế chấp (bất động sản hoặc công ty).');
    }

    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const baseRate = await this.repository.baseRate(client);
      const rate = recommendedInterestRate(character.credit_score, baseRate);

      const [cash, savingsRow, realEstateValue, companyValue, salary] = await Promise.all([
        Promise.resolve(toMinor(character.cash_minor)),
        this.repository.ensureSavingsAccount(client, character.id),
        this.repository.getOwnedRealEstateValue(client, character.id),
        this.repository.getOwnedCompanyValue(client, character.id),
        this.repository.activeSalary(client, character.id),
      ]);
      // savings total hiện tại (tổng các sổ active)
      const deposits = (await this.repository.listSavingsDeposits(character.id, client)).filter((d) => d.status === 'active');
      const savingsTotal = deposits.reduce((s, d) => s + toMinor(d.balance_minor), 0);
      const sf = scoreFactorFromCredit(character.credit_score);
      const assetBase = cash + savingsTotal + realEstateValue + companyValue;
      // Hạn mức tín dụng dựa trên điểm tín dụng + tiền mặt + tiết kiệm + bất động sản + công ty
      const unsecuredLimit = Math.min(MAX_LOAN_MINOR, Math.max(0, Math.round(assetBase * sf * 0.4)));
      // giữ tương thích nhẹ: nếu thu nhập cao, không hạ thấp hơn công thức cũ quá nhiều
      const incomeCompat = Math.min(MAX_LOAN_MINOR, Math.max(0, Math.round((salary > 0 ? salary * 24 : cash) * sf)));
      const effectiveUnsecuredLimit = Math.max(unsecuredLimit, Math.round(incomeCompat * 0.5));

      let collateralType: 'property' | 'company' | null = null;
      let collateralPropertyId: string | null = null;
      let collateralCompanyId: string | null = null;
      let maxLoan = Math.min(MAX_LOAN_MINOR, effectiveUnsecuredLimit);
      let collateralLabel = '';

      if (input.collateralPropertyId) {
        const value = await this.repository.collateralValue(client, character.id, input.collateralPropertyId);
        if (value === null) {
          throw AppError.unprocessable('Bất động sản thế chấp phải thuộc sở hữu của bạn và đang ở trạng thái sở hữu.');
        }
        if (await this.repository.isCollateralEncumbered(client, 'property', input.collateralPropertyId)) {
          throw AppError.unprocessable('Bất động sản này đang được dùng làm thế chấp cho khoản vay khác.');
        }
        const ltvMax = Math.round(value * (PROPERTY_LTV_PCT / 100));
        collateralType = 'property';
        collateralPropertyId = input.collateralPropertyId;
        maxLoan = Math.min(MAX_LOAN_MINOR, Math.max(effectiveUnsecuredLimit, ltvMax));
        if (input.amountMinor > ltvMax) {
          throw AppError.unprocessable(`Khoản vay thế chấp bất động sản vượt ${PROPERTY_LTV_PCT}% giá trị tài sản (${ltvMax.toLocaleString('vi-VN')} ₫).`);
        }
        collateralLabel = ' (thế chấp bất động sản)';
      } else if (input.collateralCompanyId) {
        const value = await this.repository.companyCollateralValue(client, character.id, input.collateralCompanyId);
        if (value === null) {
          throw AppError.unprocessable('Công ty thế chấp phải thuộc sở hữu của bạn và không ở trạng thái phá sản.');
        }
        if (await this.repository.isCollateralEncumbered(client, 'company', input.collateralCompanyId)) {
          throw AppError.unprocessable('Công ty này đang được dùng làm thế chấp cho khoản vay khác.');
        }
        const ltvMax = Math.round(value * (COMPANY_LTV_PCT / 100));
        collateralType = 'company';
        collateralCompanyId = input.collateralCompanyId;
        maxLoan = Math.min(MAX_LOAN_MINOR, Math.max(effectiveUnsecuredLimit, ltvMax));
        if (input.amountMinor > ltvMax) {
          throw AppError.unprocessable(`Khoản vay thế chấp công ty vượt ${COMPANY_LTV_PCT}% giá trị định giá công ty (${ltvMax.toLocaleString('vi-VN')} ₫).`);
        }
        collateralLabel = ' (thế chấp công ty)';
      }

      if (input.amountMinor > maxLoan) {
        throw AppError.unprocessable(
          `Số tiền vượt hạn mức vay tối đa: ${maxLoan.toLocaleString('vi-VN')} ₫`,
        );
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
        collateralType,
        collateralPropertyId,
        collateralCompanyId,
      });

      await ledger.transfer(client, {
        from: { ownerType: 'bank', ownerId: SYSTEM_BANK_ID },
        to: { ownerType: 'character', ownerId: character.id },
        amountMinor: input.amountMinor,
        kind: 'loan_disbursement',
        description: `Loan disbursement ${loan.id}${collateralLabel}`,
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
          collateralType,
          collateralPropertyId,
          collateralCompanyId,
        },
      });

      await notify(client, {
        userId,
        kind: 'banking',
        title: 'Khoản vay đã được giải ngân',
        body: `Bạn vừa vay ${input.amountMinor.toLocaleString('vi-VN')} ₫${collateralLabel} với lãi suất ${rate}%/năm.`,
        payload: { loanId: loan.id },
      });

      await this.recomputeCredit(client, character.id);
      return toLoanDto(loan);
    });
  }

  async repayLoan(userId: string, loanId: string, amountMinor: number): Promise<LoanDto> {
    if (amountMinor <= 0) throw AppError.badRequest('Số tiền trả phải lớn hơn 0.');

    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const loan = await this.repository.findLoan(loanId, character.id);
      if (!loan) throw AppError.notFound('Loan');
      if (loan.status === 'repaid')
        throw AppError.conflict('loan_repaid', 'Khoản vay đã được tất toán.');

      const outstanding = toMinor(loan.outstanding_minor);
      const payment = Math.min(amountMinor, outstanding);
      if (payment <= 0) throw AppError.badRequest('Không còn dư nợ để trả.');

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

  async depositSavings(userId: string, amountMinor: number, termMonths = 0) {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw AppError.badRequest('Số tiền gửi phải là số nguyên dương (VND).');
    }
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const cash = toMinor(character.cash_minor);
      if (cash < amountMinor) {
        throw AppError.conflict(
          'insufficient_funds',
          `Tiền mặt không đủ để gửi tiết kiệm. Có: ${cash.toLocaleString('vi-VN')} ₫, cần: ${amountMinor.toLocaleString('vi-VN')} ₫.`,
        );
      }
      const term = await this.repository.getSavingsTerm(client, termMonths);
      if (!term) throw AppError.badRequest('Kỳ hạn tiết kiệm không hợp lệ.');
      const savings = await this.repository.ensureSavingsAccount(client, character.id);

      await ledger.post(client, {
        kind: 'savings_deposit',
        description: `Savings deposit ${character.id} term ${termMonths}m`,
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

      const deposit = await this.repository.createSavingsDeposit(client, {
        characterId: character.id,
        amountMinor,
        termMonths: Number(term.term_months),
        annualRatePct: Number(term.annual_rate_pct),
      });
      const total = await this.repository.syncSavingsAggregate(client, character.id);
      return {
        depositId: deposit.id,
        balance: money(total),
      };
    });
  }

  async withdrawSavings(userId: string, amountMinor: number, depositId?: string) {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw AppError.badRequest('Số tiền rút phải là số nguyên dương (VND).');
    }
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      await this.repository.ensureSavingsAccount(client, character.id);
      const terms = await this.repository.listSavingsTerms(client);
      const termMap = new Map(terms.map((t) => [Number(t.term_months), t]));

      const takeFrom = async (target: SavingsDepositRow, takeMinor: number) => {
        const bal = toMinor(target.balance_minor);
        if (bal < takeMinor) {
          throw AppError.conflict(
            'insufficient_savings',
            `Sổ tiết kiệm không đủ số dư. Có: ${bal.toLocaleString('vi-VN')} ₫, cần rút: ${takeMinor.toLocaleString('vi-VN')} ₫.`,
          );
        }

        // Rút: gốc theo số tiền rút; lãi tính trên phần rút (đơn giản, an toàn).
        const interest = depositInterest(
          { ...target, balance_minor: String(takeMinor) } as SavingsDepositRow,
          termMap.get(Number(target.term_months)) ?? null,
        );
        const payout = takeMinor + interest;

        await ledger.post(client, {
          kind: 'savings_withdrawal',
          description: `Savings withdrawal ${character.id} deposit ${target.id}`,
          referenceType: 'savings_deposit',
          referenceId: target.id,
          legs: [
            {
              ownerType: 'character',
              ownerId: character.id,
              kind: 'savings',
              deltaMinor: -takeMinor,
            },
            { ownerType: 'character', ownerId: character.id, kind: 'cash', deltaMinor: payout },
            ...(interest > 0
              ? [
                  {
                    ownerType: 'bank' as const,
                    ownerId: SYSTEM_BANK_ID,
                    kind: 'cash' as const,
                    deltaMinor: -interest,
                  },
                ]
              : []),
          ],
        });

        const newBal = bal - takeMinor;
        await this.repository.updateSavingsDeposit(
          client,
          target.id,
          newBal,
          newBal <= 0 ? 'closed' : 'active',
        );
        return { withdrawn: takeMinor, interest, payout };
      };

      let withdrawn = 0;
      let interestTotal = 0;
      let payoutTotal = 0;
      let primaryDepositId: string | null = null;

      if (depositId) {
        const target = await this.repository.findSavingsDeposit(client, character.id, depositId);
        if (!target || target.status !== 'active') throw AppError.notFound('Sổ tiết kiệm');
        const r = await takeFrom(target, amountMinor);
        withdrawn = r.withdrawn;
        interestTotal = r.interest;
        payoutTotal = r.payout;
        primaryDepositId = target.id;
      } else {
        const deposits = (await this.repository.listSavingsDeposits(character.id, client)).filter(
          (d) => d.status === 'active' && toMinor(d.balance_minor) > 0,
        );
        const total = deposits.reduce((s, d) => s + toMinor(d.balance_minor), 0);
        if (total < amountMinor) {
          throw AppError.conflict(
            'insufficient_savings',
            `Không đủ số dư tiết kiệm. Tổng có: ${total.toLocaleString('vi-VN')} ₫, cần: ${amountMinor.toLocaleString('vi-VN')} ₫.`,
          );
        }
        // Rút tự động: ưu tiên sổ đã đáo hạn rồi đến không kỳ hạn/còn lại, rút dần qua nhiều sổ nếu cần.
        const now = Date.now();
        const sorted = [...deposits].sort((a, b) => {
          const aMatured = !a.matures_at || a.matures_at.getTime() <= now ? 0 : 1;
          const bMatured = !b.matures_at || b.matures_at.getTime() <= now ? 0 : 1;
          if (aMatured !== bMatured) return aMatured - bMatured;
          return a.opened_at.getTime() - b.opened_at.getTime();
        });
        let remaining = amountMinor;
        for (const d of sorted) {
          if (remaining <= 0) break;
          const bal = toMinor(d.balance_minor);
          const takeMinor = Math.min(bal, remaining);
          if (takeMinor <= 0) continue;
          const r = await takeFrom(d, takeMinor);
          withdrawn += r.withdrawn;
          interestTotal += r.interest;
          payoutTotal += r.payout;
          primaryDepositId = primaryDepositId ?? d.id;
          remaining -= takeMinor;
        }
        if (remaining > 0) {
          throw AppError.conflict(
            'insufficient_savings',
            `Không đủ số dư tiết kiệm để rút ${amountMinor.toLocaleString('vi-VN')} ₫.`,
          );
        }
      }

      const total = await this.repository.syncSavingsAggregate(client, character.id);
      return {
        depositId: primaryDepositId,
        withdrawn: money(withdrawn),
        interest: money(interestTotal),
        payout: money(payoutTotal),
        balance: money(total),
      };
    });
  }

  async getLoan(userId: string, loanId: string): Promise<LoanDto> {
    const character = await requireCharacterByUserId(this.repository.db, userId);
    const loan = await this.repository.findLoan(loanId, character.id);
    if (!loan) throw AppError.notFound('Loan');
    return toLoanDto(loan);
  }

  async lookupTransferRecipient(userId: string, query: { cccd?: string; accountNumber?: string }) {
    const character = await requireLivingCharacterByUserId(this.repository.db, userId);
    let target: any = null;
    if (query.cccd && query.cccd.replace(/\s+/g, '')) {
      const ref = await resolveCharacterByCccd(this.repository.db, query.cccd, { requireAlive: false });
      if (ref.id === character.id) throw AppError.badRequest('Không thể tra cứu/chuyển khoản cho chính tài khoản của bạn.');
      target = await this.charactersRepository.findById(ref.id);
    } else {
      const normalized = (query.accountNumber ?? '').replace(/\s+/g, '');
      target = normalized ? await this.charactersRepository.findByAccountNumber(normalized) : null;
    }
    if (!target) throw AppError.notFound('Không tìm thấy người nhận (CCCD/STK).');
    if (target.id === character.id) {
      throw AppError.badRequest('Không thể tra cứu/chuyển khoản cho chính tài khoản của bạn.');
    }
    const netWorth = await this.charactersRepository.getNetWorthMinor(target.id);
    const tier = resolveAccountTier(netWorth);
    return {
      accountNumber: target.account_number,
      cccdMasked: target.cccd ? maskCccd(target.cccd) : undefined,
      characterId: target.id,
      fullName: target.full_name,
      accountTier: tier,
    };
  }

  async createTransfer(
    userId: string,
    input: { targetCccd?: string; toAccountNumber?: string; amountMinor: number; message?: string },
  ) {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw AppError.badRequest('Số tiền chuyển phải là số nguyên dương (VND).');
    }
    const msg = (input.message ?? '').trim().slice(0, 200);

    const result = await withTransaction(async (client) => {
      const from = await requireLivingCharacterByUserId(client, userId);
      await assertNoPendingDivorce(from.id, client);
      const fromRow = await this.charactersRepository.findById(from.id, client);
      if (!fromRow) throw AppError.notFound('Character');

      let to: any = null;
      if (input.targetCccd && input.targetCccd.replace(/\s+/g, '')) {
        const ref = await resolveCharacterByCccd(client, input.targetCccd, { requireAlive: true });
        if (ref.id === from.id) throw AppError.badRequest('Không thể tự chuyển khoản cho chính mình.');
        to = await this.charactersRepository.findById(ref.id, client);
      } else if (input.toAccountNumber) {
        const toAcc = input.toAccountNumber.replace(/\s+/g, '');
        to = await this.charactersRepository.findByAccountNumber(toAcc, client);
      }
      if (!to) throw AppError.notFound('Không tìm thấy người nhận (CCCD/STK).');
      if (!to.is_alive) throw AppError.conflict('character_dead', 'Người nhận đã qua đời, không thể chuyển khoản.');
      if (to.id === from.id) {
        throw AppError.badRequest('Không thể tự chuyển khoản cho chính mình.');
      }

      const fromCash = toMinor(from.cash_minor);
      if (fromCash < input.amountMinor) {
        throw AppError.conflict(
          'insufficient_funds',
          `Số dư tiền mặt không đủ. Có: ${fromCash.toLocaleString('vi-VN')} ₫, cần chuyển: ${input.amountMinor.toLocaleString('vi-VN')} ₫.`,
        );
      }

      const ledgerTxId = await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: from.id, kind: 'cash' },
        to: { ownerType: 'character', ownerId: to.id, kind: 'cash' },
        amountMinor: input.amountMinor,
        kind: 'bank_transfer',
        description: `Transfer ${fromRow.account_number} -> ${to.account_number}`,
        referenceType: 'bank_transfer',
      });

      const transferId = await this.repository.insertTransfer(client, {
        fromCharacterId: from.id,
        toCharacterId: to.id,
        fromAccountNumber: fromRow.account_number,
        toAccountNumber: to.account_number,
        amountMinor: input.amountMinor,
        message: msg,
        status: 'completed',
        ledgerTransactionId: ledgerTxId,
      });

      const amtText = input.amountMinor.toLocaleString('vi-VN');
      await notify(client, {
        userId: (from.user_id ?? userId),
        kind: 'banking',
        title: 'Chuyển khoản thành công',
        body: `Bạn đã chuyển ${amtText} ₫ tới ${to.full_name} (${maskCccd(to.cccd)}).`,
        payload: { transferId, toAccountNumber: to.account_number, toCccd: to.cccd, amountMinor: input.amountMinor },
      });
      await notify(client, {
        userId: to.user_id,
        kind: 'banking',
        title: 'Nhận chuyển khoản',
        body: `Bạn nhận được ${amtText} ₫ từ ${fromRow.full_name} (${maskCccd(fromRow.cccd)}).${msg ? ` Nội dung: ${msg}` : ''}`,
        payload: {
          transferId,
          fromAccountNumber: fromRow.account_number,
          fromCccd: fromRow.cccd,
          fromName: fromRow.full_name,
          amountMinor: input.amountMinor,
          message: msg,
        },
      });

      return { transferId, to, fromRow, ledgerTxId };
    });

    const amtText = input.amountMinor.toLocaleString('vi-VN');
    await Promise.all([
      publishToUser(userId, 'notification', {
        kind: 'success',
        title: 'Chuyển khoản thành công',
        body: `Đã chuyển ${amtText} ₫ tới ${result.to.full_name} (${maskCccd(result.to.cccd)}).`,
      }),
      result.to.user_id
        ? publishToUser(result.to.user_id, 'notification', {
            kind: 'success',
            title: 'Nhận chuyển khoản',
            body: `+${amtText} ₫ từ ${result.fromRow.full_name} (${maskCccd(result.fromRow.cccd)}).${msg ? ` ${msg}` : ''}`,
          })
        : Promise.resolve(),
    ]);

    const after = await requireCharacterByUserId(this.repository.db, userId);
    return {
      transferId: result.transferId,
      toAccountNumber: result.to.account_number,
      toName: result.to.full_name,
      amount: money(input.amountMinor),
      message: msg,
      createdAt: new Date().toISOString(),
      balanceAfter: money(toMinor(after.cash_minor)),
    };
  }

  async listTransfers(userId: string) {
    const character = await requireCharacterByUserId(this.repository.db, userId);
    const rows = await this.repository.listTransfers(character.id);
    return rows.map((r) => ({
      id: r.id,
      direction: r.direction,
      counterpartyAccountNumber: r.counterparty_account_number,
      counterpartyName: r.counterparty_name,
      amount: money(toMinor(r.amount_minor)),
      message: r.message ?? '',
      status: r.status,
      createdAt: r.created_at.toISOString(),
    }));
  }
}

