import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const WelfareBenefitDtoSchema = z.object({
  id: IdSchema,
  code: z.string(),
  name: z.string(),
  description: z.string(),
  sender: z.string(),
  bonus: MoneySchema,
  month: z.number().int().min(1).max(12).nullable(),
  day: z.number().int().min(1).max(31).nullable(),
  isActive: z.boolean(),
  updatedAt: z.string().datetime().optional(),
});
export type WelfareBenefitDto = z.infer<typeof WelfareBenefitDtoSchema>;

export const WelfareAvailableDtoSchema = WelfareBenefitDtoSchema.extend({
  claimable: z.boolean(),
  claimed: z.boolean(),
  periodYear: z.number().int(),
});
export type WelfareAvailableDto = z.infer<typeof WelfareAvailableDtoSchema>;

export const UpsertWelfareBenefitRequestSchema = z.object({
  code: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  sender: z.string().max(200).default('Hệ thống'),
  bonusMinor: z.number().int().min(0),
  month: z.number().int().min(1).max(12).nullable().optional(),
  day: z.number().int().min(1).max(31).nullable().optional(),
  isActive: z.boolean().default(true),
});
export type UpsertWelfareBenefitRequest = z.infer<typeof UpsertWelfareBenefitRequestSchema>;

export const ClaimWelfareRequestSchema = z.object({
  benefitId: IdSchema.optional(),
  code: z.string().optional(),
  periodYear: z.number().int().optional(),
  // cho phép client gửi ngày/tháng/năm game hiện tại để server xác định kỳ nếu cần
  gameYear: z.number().int().optional(),
  gameMonth: z.number().int().min(1).max(12).optional(),
  gameDay: z.number().int().min(1).max(31).optional(),
});
export type ClaimWelfareRequest = z.infer<typeof ClaimWelfareRequestSchema>;

export const ClaimWelfareResponseSchema = z.object({
  ok: z.boolean(),
  claimed: z.boolean(),
  amount: MoneySchema,
  balanceAfter: MoneySchema.optional(),
  benefit: WelfareBenefitDtoSchema.optional(),
  message: z.string().optional(),
});
export type ClaimWelfareResponse = z.infer<typeof ClaimWelfareResponseSchema>;
