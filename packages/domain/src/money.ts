/** Money helpers. Amounts are integer minor units (cents). */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function assertIntegerMinorUnits(amount: number, label = 'amount'): void {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`${label} must be a safe integer in minor units`);
  }
}

export function sumMinorUnits(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => {
    assertIntegerMinorUnits(amount);
    return total + amount;
  }, 0);
}

export function percentOf(amount: number, percent: number): number {
  assertIntegerMinorUnits(amount);
  return Math.round((amount * percent) / 100);
}
