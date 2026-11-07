import { clamp, percentOf } from './money.js';

export interface InterestInput {
  principalMinor: number;
  annualRatePct: number;
  /** Number of real-time days the balance has been outstanding. */
  days: number;
}

/**
 * Simple daily interest, rounded to minor units.
 * Compounding policy belongs to the loan product, not to this function.
 */
export function accrueSimpleInterest(input: InterestInput): number {
  if (input.principalMinor <= 0 || input.annualRatePct <= 0 || input.days <= 0) {
    return 0;
  }
  const dailyRate = input.annualRatePct / 100 / 365;
  return Math.round(input.principalMinor * dailyRate * input.days);
}

export interface AmortizationInput {
  principalMinor: number;
  annualRatePct: number;
  termMonths: number;
}

/**
 * Fixed monthly payment for an amortizing loan.
 * Uses the standard annuity formula; result is rounded to minor units.
 */
export function monthlyPayment(input: AmortizationInput): number {
  const { principalMinor, annualRatePct, termMonths } = input;
  if (principalMinor <= 0 || termMonths <= 0) return 0;

  const monthlyRate = annualRatePct / 100 / 12;
  if (monthlyRate === 0) {
    return Math.ceil(principalMinor / termMonths);
  }

  const factor = Math.pow(1 + monthlyRate, termMonths);
  return Math.round((principalMinor * monthlyRate * factor) / (factor - 1));
}

export interface DefaultEvaluationInput {
  outstandingMinor: number;
  gracePeriodEnd: Date;
  now: Date;
  /** Extra days the bank tolerates before legal action. */
  bankGraceDays: number;
}

export type LoanHealth = 'current' | 'grace' | 'default' | 'foreclose';

export function evaluateLoanHealth(input: DefaultEvaluationInput): LoanHealth {
  if (input.outstandingMinor <= 0) return 'current';

  const dayMs = 86_400_000;
  const overdueDays = Math.floor((input.now.getTime() - input.gracePeriodEnd.getTime()) / dayMs);
  if (overdueDays <= 0) return 'current';
  if (overdueDays <= input.bankGraceDays) return 'grace';
  if (overdueDays <= input.bankGraceDays * 2) return 'default';
  return 'foreclose';
}

/** Late fees are charged on the overdue amount, capped at a share of principal. */
export function lateFee(
  overdueMinor: number,
  feeRatePct: number,
  originalPrincipalMinor: number,
  capPct = 20,
): number {
  const raw = percentOf(overdueMinor, feeRatePct);
  const cap = percentOf(originalPrincipalMinor, capPct);
  return Math.min(raw, cap);
}

export function recommendedInterestRate(creditScore: number, baseRatePct: number): number {
  const score = clamp(creditScore, 300, 850);
  const riskPremiumPct = ((850 - score) / 550) * 12;
  return Number((baseRatePct + riskPremiumPct).toFixed(2));
}
