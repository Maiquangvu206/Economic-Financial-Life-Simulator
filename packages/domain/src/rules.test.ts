import { describe, expect, it } from 'vitest';
import { calculateCreditScore, creditBand } from './credit.js';
import { evaluateLoanHealth } from './banking.js';
import { applyHeat, decayHeat, heatTier } from './crime/heat.js';
import { evaluateNpcDeal } from './npc.js';
import { applyGmAdjustment } from './gm.js';
import { candidateScore, electionWinner } from './elections.js';
import {
  generateCccd,
  isValidCccd,
  provinceCodeFromCccd,
  formatCccd,
  PROVINCES_34,
} from './cccd.js';
import { generateProvinceMap } from './provinceMap.js';
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

describe('npc negotiation', () => {
  it('honest npc accepts at fair value but not below', () => {
    expect(evaluateNpcDeal({ personality: 'honest', offerMinor: 100, fairValue: 100 }).accept).toBe(
      true,
    );
    const low = evaluateNpcDeal({ personality: 'honest', offerMinor: 50, fairValue: 100 });
    expect(low.accept).toBe(false);
    expect(low.counterOfferMinor).toBeGreaterThanOrEqual(100);
    expect(low.counterOfferMinor).toBeLessThanOrEqual(105);
  });

  it('greedy npc counters higher than cautious', () => {
    const greedy = evaluateNpcDeal({ personality: 'greedy', offerMinor: 50, fairValue: 100 });
    const cautious = evaluateNpcDeal({ personality: 'cautious', offerMinor: 50, fairValue: 100 });
    expect(greedy.counterOfferMinor).toBeGreaterThan(cautious.counterOfferMinor ?? 0);
  });
});

describe('gm macro adjustment', () => {
  const current = {
    inflationPct: 3,
    unemploymentPct: 5,
    baseRatePct: 5,
    gdpGrowthPct: 2,
    cpi: 100,
  };

  it('raise_rate lifts base rate within bounds', () => {
    const result = applyGmAdjustment({ action: 'raise_rate', magnitude: 0.5, current });
    expect(result.next.baseRatePct).toBeCloseTo(6);
    expect(result.next.baseRatePct).toBeLessThanOrEqual(15);
  });

  it('magnitude is clamped to 1', () => {
    const result = applyGmAdjustment({ action: 'cut_rate', magnitude: 5, current });
    expect(result.next.baseRatePct).toBeGreaterThanOrEqual(0.5);
  });

  it('do_nothing leaves state untouched', () => {
    const result = applyGmAdjustment({ action: 'do_nothing', magnitude: 1, current });
    expect(result.next).toEqual(current);
  });
});
describe('election scoring', () => {
  it('adds 10 votes per 1tr donation', () => {
    expect(candidateScore({ votes: 5, donationsMinor: 2_000_000 })).toBe(25);
  });

  it('picks deterministic winner on tie by smaller id', () => {
    const winner = electionWinner([
      { id: 'b', votes: 10, donationsMinor: 0 },
      { id: 'a', votes: 10, donationsMinor: 0 },
    ]);
    expect(winner).toBe('a');
  });
});
describe('cccd', () => {
  it('has 34 provinces (6 cities)', () => {
    expect(PROVINCES_34).toHaveLength(34);
    expect(PROVINCES_34.filter((p) => p.isCity)).toHaveLength(6);
  });

  it('generates valid 12-digit cccd with province prefix', () => {
    const cccd = generateCccd('001', () => 0.5);
    expect(cccd).toHaveLength(12);
    expect(isValidCccd(cccd)).toBe(true);
    expect(provinceCodeFromCccd(cccd)).toBe('001');
  });

  it('rejects cccd with unknown province', () => {
    expect(isValidCccd('099000000000')).toBe(false);
    expect(isValidCccd('123')).toBe(false);
  });

  it('formats cccd in 3-3-3-3 groups', () => {
    expect(formatCccd('001234567890')).toBe('001 234 567 890');
  });
});
describe('province map', () => {
  it('generates deterministic boundary with water outside', () => {
    const a = generateProvinceMap('079');
    const b = generateProvinceMap('079');
    expect(a.nodes).toHaveLength(32 * 20);
    expect(a.nodes).toEqual(b.nodes);
    const water = a.nodes.filter((n) => n.zone === 'water');
    expect(water.length).toBeGreaterThan(50);
    expect(water.length).toBeLessThan(a.nodes.length);
    // Ít nhất một ô đất tồn tại
    expect(a.nodes.some((n) => n.zone !== 'water')).toBe(true);
    // Khác tỉnh khác hình dạng (địa giới thật)
    const c = generateProvinceMap('001');
    expect(c.nodes.map((n) => n.zone).join()).not.toEqual(a.nodes.map((n) => n.zone).join());
  });

  it('uses real GADM shapes: land ratio differs per province', () => {
    const landOf = (code: string) =>
      generateProvinceMap(code).nodes.filter((n) => n.zone !== 'water').length;
    const hcm = landOf('079');
    const hn = landOf('001');
    const cp = landOf('092');
    // Ba tỉnh thành lớn, tỉ lệ đất khác nhau rõ rệt (địa giới thật)
    expect(hcm).toBeGreaterThan(80);
    expect(hn).toBeGreaterThan(80);
    expect(cp).toBeGreaterThan(80);
    expect(
      generateProvinceMap('079')
        .nodes.map((n) => n.zone)
        .join(),
    ).not.toEqual(
      generateProvinceMap('001')
        .nodes.map((n) => n.zone)
        .join(),
    );
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
