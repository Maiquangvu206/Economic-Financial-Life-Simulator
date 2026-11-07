export function toMinor(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Money value ${String(value)} exceeds the safe integer range`);
  }
  return parsed;
}
