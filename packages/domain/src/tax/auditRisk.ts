import { clamp01 } from '../money.js';

export interface AuditSignals {
  /** Relative gap between declared and observed books. 0..1+ */
  bookMismatchRatio: number;
  /** Quality of forged credentials. 1 = indistinguishable, 0 = obvious fake. */
  credentialQuality: number;
  /** Character heat level, 0..100. */
  heatLevel: number;
  /** Share of cash flow routed through offshore accounts, 0..1. */
  offshoreFlowRatio: number;
  /** A whistleblower or competitor reported the actor. */
  reportedByWhistleblower: boolean;
}

/**
 * Audit risk in [0, 1]. This is a probability-like score, not a random roll.
 * The worker performs the actual roll with a server-side RNG.
 */
export function calculateAuditRisk(signals: AuditSignals): number {
  const mismatch = clamp01(signals.bookMismatchRatio) * 0.35;
  const forgedCredentials = (1 - clamp01(signals.credentialQuality)) * 0.2;
  const heat = clamp01(signals.heatLevel / 100) * 0.25;
  const offshore = clamp01(signals.offshoreFlowRatio) * 0.15;
  const whistleblower = signals.reportedByWhistleblower ? 0.25 : 0;

  return clamp01(mismatch + forgedCredentials + heat + offshore + whistleblower);
}
