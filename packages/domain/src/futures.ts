import { clamp } from './money.js';

/**
 * Phái sinh: hợp đồng tương lai long (market-made).
 * Long gọi: payoff = max(0, spot - strike) * qty (trừ premium đã trả).
 */
export interface FuturePayoffInput {
  spotMinor: number;
  strikeMinor: number;
  quantity: number;
  premiumMinor: number;
  marginMinor: number;
}

export interface FuturePayoffResult {
  payoffMinor: number;
  pnlMinor: number;
  marginReturnedMinor: number;
  marginLostMinor: number;
}

export function futurePayoff(input: FuturePayoffInput): FuturePayoffResult {
  const { spotMinor, strikeMinor, quantity, premiumMinor, marginMinor } = input;
  const intrinsic = Math.max(0, spotMinor - strikeMinor) * quantity;
  const payoff = clamp(intrinsic, 0, Number.MAX_SAFE_INTEGER);
  const pnl = payoff - premiumMinor;
  // Margin trả lại trừ phần lỗ (nếu lỗ) nhưng không dưới 0.
  const marginLost = clamp(-pnl, 0, marginMinor);
  const marginReturned = marginMinor - marginLost;
  return { payoffMinor: payoff, pnlMinor: pnl, marginReturnedMinor: marginReturned, marginLostMinor: marginLost };
}

/** Premium đề xuất: 5% * strike * qty. Margin đề xuất: 20% * strike * qty. */
export function futurePricing(strikeMinor: number, quantity: number) {
  return {
    premiumMinor: Math.round(strikeMinor * quantity * 0.05),
    marginMinor: Math.round(strikeMinor * quantity * 0.2),
  };
}
