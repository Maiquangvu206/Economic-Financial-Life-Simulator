import { clamp } from './money.js';

export interface CreditProfile {
  /** Number of payments made on or before the due date. */
  onTimePayments: number;
  /** Number of payments made after the due date. */
  latePayments: number;
  /** Number of loans that reached default / foreclosure. */
  defaults: number;
  /** Total debt service divided by gross income. 0.4 means 40%. */
  debtToIncomeRatio: number;
  /** Age of the oldest credit account, in months. */
  accountAgeMonths: number;
  /** Number of personal bankruptcies on record. */
  bankruptcies: number;
}

const MIN_SCORE = 300;
const MAX_SCORE = 850;

/**
 * Deterministic credit score in [300, 850].
 * Mirrors the GDD's dynamic credit score, but stays fully auditable.
 */
export function calculateCreditScore(profile: CreditProfile): number {
  const onTime = Math.max(0, profile.onTimePayments);
  const late = Math.max(0, profile.latePayments);
  const defaults = Math.max(0, profile.defaults);
  const bankruptcies = Math.max(0, profile.bankruptcies);

  const resolved = onTime + late + defaults;
  const paymentHistory = resolved === 0 ? 0.65 : (onTime + late * 0.4) / resolved;

  // Lower debt-to-income is better; 0% => 1.0, 100%+ => 0.0.
  const utilization = 1 - clamp(profile.debtToIncomeRatio, 0, 1);

  const historyMonths = Math.max(0, profile.accountAgeMonths);
  const history = clamp(historyMonths / 120, 0, 1);

  const defaultPenalty = clamp(defaults * 0.22, 0, 1);
  const bankruptcyPenalty = clamp(bankruptcies * 0.35, 0, 1);

  const weighted =
    paymentHistory * 0.45 +
    utilization * 0.25 +
    history * 0.15 +
    (1 - defaultPenalty) * 0.1 +
    (1 - bankruptcyPenalty) * 0.05;

  const score = MIN_SCORE + (MAX_SCORE - MIN_SCORE) * clamp(weighted, 0, 1);
  return Math.round(clamp(score, MIN_SCORE, MAX_SCORE));
}

export type CreditBand = 'poor' | 'fair' | 'good' | 'very_good' | 'excellent';

export function creditBand(score: number): CreditBand {
  if (score < 580) return 'poor';
  if (score < 670) return 'fair';
  if (score < 740) return 'good';
  if (score < 800) return 'very_good';
  return 'excellent';
}
