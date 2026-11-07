import { clamp } from '../money.js';

export const HEAT_MIN = 0;
export const HEAT_MAX = 100;

export type HeatTier = 'clean' | 'watched' | 'wanted' | 'manhunt';

export function applyHeat(current: number, delta: number): number {
  return clamp(current + delta, HEAT_MIN, HEAT_MAX);
}

/**
 * Heat decays every in-game year when the player keeps a low profile.
 * `decayPerYear` is the base decay before tier modifiers.
 */
export function decayHeat(current: number, inGameYears: number, decayPerYear = 4): number {
  if (inGameYears <= 0) return current;
  return clamp(current - decayPerYear * inGameYears, HEAT_MIN, HEAT_MAX);
}

export function heatTier(level: number): HeatTier {
  if (level < 20) return 'clean';
  if (level < 50) return 'watched';
  if (level < 80) return 'wanted';
  return 'manhunt';
}

/** A server-wide police sweep is only justified at manhunt level. */
export function shouldTriggerSweep(level: number): boolean {
  return heatTier(level) === 'manhunt';
}
