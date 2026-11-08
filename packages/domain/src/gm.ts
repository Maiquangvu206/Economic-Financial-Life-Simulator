import { clamp } from './money.js';

/** Chỉ thị vĩ mô mà GM AI được phép đề xuất. Core áp biên. */
export type GmAction = 'raise_rate' | 'cut_rate' | 'trigger_crisis' | 'stimulus' | 'do_nothing';

export interface MacroState {
  inflationPct: number;
  unemploymentPct: number;
  baseRatePct: number;
  gdpGrowthPct: number;
  cpi: number;
}

export interface GmAdjustmentInput {
  action: GmAction;
  magnitude: number; // 0-1
  current: MacroState;
}

export interface GmAdjustmentResult {
  next: MacroState;
  adjustment: Partial<MacroState>;
  note: string;
}

/**
 * Điều chỉnh vĩ mô có biên (pure, deterministic).
 * magnitude được clamp 0..1; lãi suất chốt trong [0.5, 15]%; lạm phát [0, 20]%.
 */
export function applyGmAdjustment(input: GmAdjustmentInput): GmAdjustmentResult {
  const magnitude = clamp(input.magnitude, 0, 1);
  const { current } = input;
  const next: MacroState = { ...current };
  const adjustment: Partial<MacroState> = {};

  switch (input.action) {
    case 'raise_rate': {
      const delta = magnitude * 2;
      next.baseRatePct = clamp(current.baseRatePct + delta, 0.5, 15);
      next.inflationPct = clamp(current.inflationPct - magnitude * 0.5, 0, 20);
      adjustment.baseRatePct = next.baseRatePct - current.baseRatePct;
      break;
    }
    case 'cut_rate': {
      const delta = magnitude * 2;
      next.baseRatePct = clamp(current.baseRatePct - delta, 0.5, 15);
      next.inflationPct = clamp(current.inflationPct + magnitude * 0.5, 0, 20);
      adjustment.baseRatePct = next.baseRatePct - current.baseRatePct;
      break;
    }
    case 'stimulus': {
      next.gdpGrowthPct = clamp(current.gdpGrowthPct + magnitude * 2, -10, 10);
      next.unemploymentPct = clamp(current.unemploymentPct - magnitude * 1.5, 0, 25);
      adjustment.gdpGrowthPct = next.gdpGrowthPct - current.gdpGrowthPct;
      adjustment.unemploymentPct = next.unemploymentPct - current.unemploymentPct;
      break;
    }
    case 'trigger_crisis': {
      next.inflationPct = clamp(current.inflationPct + magnitude * 4, 0, 20);
      next.gdpGrowthPct = clamp(current.gdpGrowthPct - magnitude * 3, -10, 10);
      next.unemploymentPct = clamp(current.unemploymentPct + magnitude * 3, 0, 25);
      adjustment.inflationPct = next.inflationPct - current.inflationPct;
      adjustment.gdpGrowthPct = next.gdpGrowthPct - current.gdpGrowthPct;
      break;
    }
    case 'do_nothing':
    default:
      break;
  }

  return {
    next,
    adjustment,
    note: `action=${input.action} magnitude=${magnitude.toFixed(2)}`,
  };
}
