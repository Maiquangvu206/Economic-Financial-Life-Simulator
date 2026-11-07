import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const MacroSnapshotDtoSchema = z.object({
  tick: z.number().int().nonnegative(),
  inGameYear: z.number().int(),
  moneySupply: MoneySchema,
  inflationPct: z.number(),
  cpi: z.number(),
  marketCap: MoneySchema,
  concurrentUsers: z.number().int().nonnegative(),
  activeCourtCases: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});
export type MacroSnapshotDto = z.infer<typeof MacroSnapshotDtoSchema>;

export const MacroEventTypeSchema = z.enum([
  'banking_crisis',
  'pandemic',
  'crime_sweep',
  'market_boom',
  'market_crash',
]);
export type MacroEventType = z.infer<typeof MacroEventTypeSchema>;

export const TriggerMacroEventRequestSchema = z.object({
  type: MacroEventTypeSchema,
  severity: z.number().min(0).max(1),
  durationInGameYears: z.number().int().min(1).max(20),
  reason: z.string().max(500),
});
export type TriggerMacroEventRequest = z.infer<typeof TriggerMacroEventRequestSchema>;

export const AdminPlayerActionRequestSchema = z.object({
  action: z.enum(['fine', 'ban', 'grant_aid', 'unban']),
  characterId: IdSchema,
  amount: MoneySchema.optional(),
  note: z.string().max(500).optional(),
});
export type AdminPlayerActionRequest = z.infer<typeof AdminPlayerActionRequestSchema>;
