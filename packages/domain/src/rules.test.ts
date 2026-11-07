import { describe, expect, it } from 'vitest';
import { calculateCreditScore, creditBand } from './credit.js';
import { evaluateLoanHealth } from './banking.js';
import { applyHeat, decayHeat, heatTier } from './crime/heat.js';
import { calculateAuditRisk } from './tax/auditRisk.js';
import { matchOrderBook } from './stock/orderBook.js';

describe('credit score', () => {
  it('stays within the 300-850 range', () => {
    expect(
      calculateCreditScore({
        onTimePayments: 0,
        latePayments: 0,
        defaults: 10,
        debtToIncomeRatio: 2,
        accountAgeMonths: 0,
        bankruptcies: 2,
      }),
    ).toBeGreaterThanOrEqual(300);

    const best = calculateCreditScore({
      onTimePayments: 120,
      latePayments: 0,
      defaults: 0,
      debtToIncomeRatio: 0,
      accountAgeMonths: 240,
      bankruptcies: 0,
    });
    expect(best).toBeLessThanOrEqual(850);
    expect(creditBand(best)).toBe('excellent');
  });

  it('rewards on-time payments over defaults', () => {
    const good = calculateCreditScore({
      onTimePayments: 36,
      latePayments: 1,
      defaults: 0,
      debtToIncomeRatio: 0.2,
      accountAgeMonths: 60,
      bankruptcies: 0,
    });
    const bad = calculateCreditScore({
      onTimePayments: 2,
      latePayments: 8,
      defaults: 3,
      debtToIncomeRatio: 0.9,
      accountAgeMonths: 60,
      bankruptcies: 1,
    });
    expect(good).toBeGreaterThan(bad);
  });
});

describe('loan health', () => {
  it('moves through grace, default and foreclosure', () => {
    const graceEnd = new Date('2026-01-01T00:00:00Z');
    const base = {
      outstandingMinor: 100_00,
      gracePeriodEnd: graceEnd,
      bankGraceDays: 10,
    };

    expect(evaluateLoanHealth({ ...base, now: new Date('2026-01-01T00:00:00Z') })).toBe('current');
    expect(evaluateLoanHealth({ ...base, now: new Date('2026-01-06T00:00:00Z') })).toBe('grace');
    expect(evaluateLoanHealth({ ...base, now: new Date('2026-01-17T00:00:00Z') })).toBe('default');
    expect(evaluateLoanHealth({ ...base, now: new Date('2026-02-01T00:00:00Z') })).toBe(
      'foreclose',
    );
  });
});

describe('heat', () => {
  it('clamps and triggers manhunt only at the top tier', () => {
    expect(applyHeat(95, 20)).toBe(100);
    expect(applyHeat(5, -20)).toBe(0);
    expect(heatTier(85)).toBe('manhunt');
    expect(decayHeat(30, 2)).toBe(22);
  });
});

describe('audit risk', () => {
  it('is a bounded probability and rises with red flags', () => {
    const clean = calculateAuditRisk({
      bookMismatchRatio: 0,
      credentialQuality: 1,
      heatLevel: 0,
      offshoreFlowRatio: 0,
      reportedByWhistleblower: false,
    });
    const dirty = calculateAuditRisk({
      bookMismatchRatio: 0.9,
      credentialQuality: 0.1,
      heatLevel: 90,
      offshoreFlowRatio: 0.8,
      reportedByWhistleblower: true,
    });

    expect(clean).toBe(0);
    expect(dirty).toBeLessThanOrEqual(1);
    expect(dirty).toBeGreaterThan(clean);
  });
});

describe('order book', () => {
  it('matches in price-time priority', () => {
    const result = matchOrderBook([
      { id: 'b1', side: 'buy', priceMinor: 105, amount: 10, sequence: 1 },
      { id: 'b2', side: 'buy', priceMinor: 105, amount: 5, sequence: 2 },
      { id: 's1', side: 'sell', priceMinor: 100, amount: 8, sequence: 3 },
      { id: 's2', side: 'sell', priceMinor: 106, amount: 8, sequence: 4 },
    ]);

    // s1 is fully filled at b1's resting price; s2 (106) never crosses the remaining bids (105).
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual({
      buyOrderId: 'b1',
      sellOrderId: 's1',
      priceMinor: 105,
      amount: 8,
    });
    expect(result.remaining).toEqual([
      { id: 'b1', amount: 2 },
      { id: 'b2', amount: 5 },
      { id: 's2', amount: 8 },
    ]);
  });

  it('does not cross when the best bid is below the best ask', () => {
    const result = matchOrderBook([
      { id: 'b1', side: 'buy', priceMinor: 99, amount: 5, sequence: 1 },
      { id: 's1', side: 'sell', priceMinor: 100, amount: 5, sequence: 2 },
    ]);
    expect(result.trades).toHaveLength(0);
    expect(result.remaining).toHaveLength(2);
  });
});
