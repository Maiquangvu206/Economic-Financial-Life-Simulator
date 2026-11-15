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

export const BroadcastTypeSchema = z.enum(['urgent', 'maintenance', 'event', 'economy', 'news']);
export type BroadcastType = z.infer<typeof BroadcastTypeSchema>;

export const BroadcastScopeSchema = z.enum(['all', 'workers', 'investors', 'businesses']);
export type BroadcastScope = z.infer<typeof BroadcastScopeSchema>;

export const SystemBroadcastDtoSchema = z.object({
  id: IdSchema,
  title: z.string(),
  content: z.string(),
  type: BroadcastTypeSchema,
  scope: BroadcastScopeSchema,
  pinned: z.boolean(),
  sender: z.string(),
  createdAt: z.string().datetime(),
});
export type SystemBroadcastDto = z.infer<typeof SystemBroadcastDtoSchema>;

export const CreateSystemBroadcastRequestSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  type: BroadcastTypeSchema.default('news'),
  scope: BroadcastScopeSchema.default('all'),
  pinned: z.boolean().default(false),
});
export type CreateSystemBroadcastRequest = z.infer<typeof CreateSystemBroadcastRequestSchema>;

export const AdminAuditLogDtoSchema = z.object({
  id: IdSchema,
  actorId: IdSchema.nullable(),
  action: z.string(),
  detail: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});
export type AdminAuditLogDto = z.infer<typeof AdminAuditLogDtoSchema>;

export const AdminPlayerSummaryDtoSchema = z.object({
  id: IdSchema,
  userId: IdSchema.nullable(),
  fullName: z.string(),
  cccd: z.string().nullable().optional(),
  isAlive: z.boolean(),
  cash: MoneySchema,
  creditScore: z.number().int(),
  heatLevel: z.number().int(),
  age: z.number().int(),
  role: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
});
export type AdminPlayerSummaryDto = z.infer<typeof AdminPlayerSummaryDtoSchema>;

export const GameConfigDtoSchema = z.object({
  season: z.enum(['spring', 'summer', 'autumn', 'winter']),
  currentDay: z.number().int(),
  currentYear: z.number().int(),
});
export type GameConfigDto = z.infer<typeof GameConfigDtoSchema>;

export const UpdateGameConfigRequestSchema = z.object({
  season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),
  currentDay: z.number().int().min(0).optional(),
  currentYear: z.number().int().min(1).optional(),
});
export type UpdateGameConfigRequest = z.infer<typeof UpdateGameConfigRequestSchema>;
