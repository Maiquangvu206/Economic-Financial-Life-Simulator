import { clamp } from './money.js';

/** Tính cách NPC: hệ số chấp nhận và biên counter theo % fairValue. */
export type NpcPersonality = 'aggressive' | 'cautious' | 'greedy' | 'honest';

export interface NpcDealRuleInput {
  personality: NpcPersonality;
  offerMinor: number;
  fairValue: number;
}

export interface NpcDealRuleResult {
  accept: boolean;
  counterOfferMinor: number | null;
  moodDelta: number;
}

export const NPC_ACCEPT_RATIO: Record<NpcPersonality, number> = {
  aggressive: 0.85,
  cautious: 0.95,
  greedy: 0.9,
  honest: 1.0,
};

export const NPC_COUNTER_BAND: Record<NpcPersonality, [number, number]> = {
  aggressive: [1.05, 1.3],
  cautious: [1.0, 1.1],
  greedy: [1.35, 1.6],
  honest: [1.0, 1.05],
};

/**
 * Rule đàm phán NPC theo tính cách (pure, deterministic).
 * Core chốt accept/counter; AI chỉ đóng góp dialogue + tone.
 */
export function evaluateNpcDeal(input: NpcDealRuleInput): NpcDealRuleResult {
  const { personality, offerMinor, fairValue } = input;
  if (fairValue <= 0) return { accept: false, counterOfferMinor: null, moodDelta: 0 };
  const ratio = offerMinor / fairValue;
  const acceptThreshold = NPC_ACCEPT_RATIO[personality];
  const accept = ratio >= acceptThreshold;

  if (accept) {
    return {
      accept: true,
      counterOfferMinor: null,
      moodDelta: clamp((ratio - acceptThreshold) * 2, -1, 1),
    };
  }

  const [low, high] = NPC_COUNTER_BAND[personality];
  const mid = (low + high) / 2;
  const counter = Math.round(fairValue * mid);
  const moodDelta = clamp(-(ratio - acceptThreshold), -1, 1);
  return { accept: false, counterOfferMinor: counter, moodDelta };
}
