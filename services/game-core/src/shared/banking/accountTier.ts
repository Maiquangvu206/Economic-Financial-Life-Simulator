import type { AccountTier } from '@efls/contracts';

export interface AccountTierInfo {
  tier: AccountTier;
  label: string;
  minNetWorthMinor: number;
}

export type AccountTierThresholds = {
  standard: number;
  silver: number;
  gold: number;
  platinum: number;
  diamond: number;
};

export const DEFAULT_ACCOUNT_TIER_THRESHOLDS: AccountTierThresholds = {
  standard: 0,
  silver: 50_000_000,
  gold: 200_000_000,
  platinum: 1_000_000_000,
  diamond: 5_000_000_000,
};

export const ACCOUNT_TIERS: AccountTierInfo[] = [
  { tier: 'standard', label: 'Thường', minNetWorthMinor: DEFAULT_ACCOUNT_TIER_THRESHOLDS.standard },
  { tier: 'silver', label: 'Bạc', minNetWorthMinor: DEFAULT_ACCOUNT_TIER_THRESHOLDS.silver },
  { tier: 'gold', label: 'Vàng', minNetWorthMinor: DEFAULT_ACCOUNT_TIER_THRESHOLDS.gold },
  { tier: 'platinum', label: 'Bạch Kim', minNetWorthMinor: DEFAULT_ACCOUNT_TIER_THRESHOLDS.platinum },
  { tier: 'diamond', label: 'Kim Cương', minNetWorthMinor: DEFAULT_ACCOUNT_TIER_THRESHOLDS.diamond },
];

export function normalizeAccountTierThresholds(raw: any): AccountTierThresholds {
  const t = raw && typeof raw === 'object' ? raw : {};
  const n = (v: any, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.trunc(x) : d;
  };
  return {
    standard: 0, // luôn là mốc thấp nhất
    silver: n(t.silver, DEFAULT_ACCOUNT_TIER_THRESHOLDS.silver),
    gold: n(t.gold, DEFAULT_ACCOUNT_TIER_THRESHOLDS.gold),
    platinum: n(t.platinum, DEFAULT_ACCOUNT_TIER_THRESHOLDS.platinum),
    diamond: n(t.diamond, DEFAULT_ACCOUNT_TIER_THRESHOLDS.diamond),
  };
}

export function resolveAccountTier(valueMinor: number, thresholds?: Partial<AccountTierThresholds> | null): AccountTier {
  const th = normalizeAccountTierThresholds(thresholds ?? DEFAULT_ACCOUNT_TIER_THRESHOLDS);
  const v = Number.isFinite(Number(valueMinor)) ? Number(valueMinor) : 0;
  let tier: AccountTier = 'standard';
  const ordered: Array<[AccountTier, number]> = [
    ['standard', th.standard],
    ['silver', th.silver],
    ['gold', th.gold],
    ['platinum', th.platinum],
    ['diamond', th.diamond],
  ];
  for (const [name, min] of ordered) {
    if (v >= min) tier = name;
  }
  return tier;
}

export function accountTierLabel(tier: AccountTier): string {
  return ACCOUNT_TIERS.find((t) => t.tier === tier)?.label ?? 'Thường';
}

export function generateAccountNumber(): string {
  // 10 chữ số, không bắt đầu bằng 0
  const n = Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;
  return String(n);
}
