import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const GiftCodeDtoSchema = z.object({
  id: IdSchema,
  code: z.string(),
  title: z.string(),
  description: z.string(),
  rewardCash: MoneySchema,
  maxUses: z.number().int().positive().nullable(),
  usesPerAccount: z.number().int().positive(),
  usedCount: z.number().int().nonnegative(),
  remainingUses: z.number().int().nonnegative().nullable(),
  isActive: z.boolean(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type GiftCodeDto = z.infer<typeof GiftCodeDtoSchema>;

export const GiftCodeRedemptionDtoSchema = z.object({
  id: IdSchema,
  giftCodeId: IdSchema,
  code: z.string(),
  title: z.string(),
  userId: IdSchema,
  characterId: IdSchema,
  characterName: z.string().nullable().optional(),
  accountEmail: z.string().nullable().optional(),
  accountUsername: z.string().nullable().optional(),
  amount: MoneySchema,
  redeemedAt: z.string().datetime(),
});
export type GiftCodeRedemptionDto = z.infer<typeof GiftCodeRedemptionDtoSchema>;

export const UpsertGiftCodeRequestSchema = z.object({
  code: z.string().trim().min(3).max(64).transform((v) => v.toUpperCase()),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(''),
  rewardCashMinor: z.number().int().min(0),
  maxUses: z.number().int().positive().nullable().optional(),
  usesPerAccount: z.number().int().min(1).max(100).default(1),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});
export type UpsertGiftCodeRequest = z.infer<typeof UpsertGiftCodeRequestSchema>;

export const RedeemGiftCodeRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
export type RedeemGiftCodeRequest = z.infer<typeof RedeemGiftCodeRequestSchema>;

export const RedeemGiftCodeResponseSchema = z.object({
  ok: z.boolean(),
  redeemed: z.boolean(),
  amount: MoneySchema,
  balanceAfter: MoneySchema.optional(),
  giftCode: GiftCodeDtoSchema.pick({ id: true, code: true, title: true }).optional(),
  message: z.string().optional(),
});
export type RedeemGiftCodeResponse = z.infer<typeof RedeemGiftCodeResponseSchema>;

export const MyGiftCodeRedemptionDtoSchema = z.object({
  id: IdSchema,
  code: z.string(),
  title: z.string(),
  amount: MoneySchema,
  redeemedAt: z.string().datetime(),
});
export type MyGiftCodeRedemptionDto = z.infer<typeof MyGiftCodeRedemptionDtoSchema>;
