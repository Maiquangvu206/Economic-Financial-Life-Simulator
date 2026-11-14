import type { AccountTier } from '@efls/contracts';

export interface AccountTierInfo {
  tier: AccountTier;
  label: string;
  minNetWorthMinor: number;
}

export const ACCOUNT_TIERS: AccountTierInfo[] = [
  { tier: 'standard', label: 'Thường', minNetWorthMinor: 0 },
  { tier: 'silver', label: 'Bạc', minNetWorthMinor: 50_000_000 },
  { tier: 'gold', label: 'Vàng', minNetWorthMinor: 200_000_000 },
  { tier: 'platinum', label: 'Bạch Kim', minNetWorthMinor: 1_000_000_000 },
  { tier: 'diamond', label: 'Kim Cương', minNetWorthMinor: 5_000_000_000 },
];

export function resolveAccountTier(netWorthMinor: number): AccountTier {
  let tier: AccountTier = 'standard';
  for (const item of ACCOUNT_TIERS) {
    if (netWorthMinor >= item.minNetWorthMinor) tier = item.tier;
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
