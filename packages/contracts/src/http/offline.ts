import { z } from 'zod';
import { MoneySchema } from '../common/money.js';

export const OfflinePlayerSettingsDtoSchema = z.object({
  characterId: z.string().uuid().optional(),
  offlineProcessingEnabled: z.boolean(),
  autoClaimWelfare: z.boolean(),
  autoPay: z.boolean(),
  catchupEnabled: z.boolean(),
  showRecapOnLogin: z.boolean(),
  lastOfflineProcessedAt: z.string().datetime().nullable().optional(),
});
export type OfflinePlayerSettingsDto = z.infer<typeof OfflinePlayerSettingsDtoSchema>;

export const UpdateOfflinePlayerSettingsRequestSchema = z.object({
  offlineProcessingEnabled: z.boolean().optional(),
  autoClaimWelfare: z.boolean().optional(),
  autoPay: z.boolean().optional(),
  catchupEnabled: z.boolean().optional(),
  showRecapOnLogin: z.boolean().optional(),
});
export type UpdateOfflinePlayerSettingsRequest = z.infer<typeof UpdateOfflinePlayerSettingsRequestSchema>;

export const OfflinePolicyDtoSchema = z.object({
  enabled: z.boolean(),
  maxOfflineMinutes: z.number().int().min(0).max(10080),
  allowAutoClaimWelfare: z.boolean(),
  allowAutoPay: z.boolean(),
  allowCatchup: z.boolean(),
  defaultAutoClaimWelfare: z.boolean(),
  defaultAutoPay: z.boolean(),
  defaultCatchup: z.boolean(),
  defaultShowRecap: z.boolean(),
  updatedAt: z.string().datetime().optional(),
});
export type OfflinePolicyDto = z.infer<typeof OfflinePolicyDtoSchema>;

export const UpdateOfflinePolicyRequestSchema = z.object({
  enabled: z.boolean().optional(),
  maxOfflineMinutes: z.number().int().min(0).max(10080).optional(),
  allowAutoClaimWelfare: z.boolean().optional(),
  allowAutoPay: z.boolean().optional(),
  allowCatchup: z.boolean().optional(),
  defaultAutoClaimWelfare: z.boolean().optional(),
  defaultAutoPay: z.boolean().optional(),
  defaultCatchup: z.boolean().optional(),
  defaultShowRecap: z.boolean().optional(),
});
export type UpdateOfflinePolicyRequest = z.infer<typeof UpdateOfflinePolicyRequestSchema>;

export const OfflineRecapDtoSchema = z.object({
  id: z.string().uuid().optional(),
  characterId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  processedMinutes: z.number().int().nonnegative().optional(),
  income: MoneySchema,
  expenses: MoneySchema,
  netCashFlow: MoneySchema,
  stockMovements: z.array(z.object({ ticker: z.string(), changePct: z.number() })).optional().default([]),
  events: z.array(z.object({ type: z.string(), message: z.string() })).optional().default([]),
  summary: z.record(z.unknown()).optional(),
});
export type OfflineRecapDto = z.infer<typeof OfflineRecapDtoSchema>;

export const OfflineProcessResponseSchema = z.object({
  ok: z.boolean(),
  processed: z.boolean(),
  recap: OfflineRecapDtoSchema.nullable().optional(),
  message: z.string().optional(),
});
export type OfflineProcessResponse = z.infer<typeof OfflineProcessResponseSchema>;