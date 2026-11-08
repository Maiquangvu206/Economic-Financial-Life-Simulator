import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const MarriageDtoSchema = z.object({
  id: IdSchema,
  characterId: IdSchema,
  characterName: z.string(),
  spouseId: IdSchema,
  spouseName: z.string(),
  prenupEnabled: z.boolean(),
  status: z.enum(['active', 'divorced', 'widowed']),
  marriedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
});
export type MarriageDto = z.infer<typeof MarriageDtoSchema>;

export const FamilyMemberDtoSchema = z.object({
  characterId: IdSchema,
  characterName: z.string(),
  relationship: z.string(),
  parentId: IdSchema.nullable(),
  generationLevel: z.number().int(),
  inheritancePct: z.number(),
});
export type FamilyMemberDto = z.infer<typeof FamilyMemberDtoSchema>;

export const WillDtoSchema = z.object({
  id: IdSchema.nullable(),
  primaryHeirId: IdSchema.nullable(),
  primaryHeirName: z.string().nullable(),
  trustFundEnabled: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
});
export type WillDto = z.infer<typeof WillDtoSchema>;

export const TrustFundDtoSchema = z.object({
  id: IdSchema,
  beneficiaryId: IdSchema.nullable(),
  beneficiaryName: z.string().nullable(),
  balance: MoneySchema,
});
export type TrustFundDto = z.infer<typeof TrustFundDtoSchema>;

export const SocialOverviewDtoSchema = z.object({
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']),
  spouse: z.object({ characterId: IdSchema, characterName: z.string() }).nullable(),
  marriages: z.array(MarriageDtoSchema),
  family: z.array(FamilyMemberDtoSchema),
  will: WillDtoSchema,
  trustFunds: z.array(TrustFundDtoSchema),
  trustFundTotal: MoneySchema,
});
export type SocialOverviewDto = z.infer<typeof SocialOverviewDtoSchema>;

export const MarryRequestSchema = z.object({
  spouseCharacterId: IdSchema,
  prenupEnabled: z.boolean().default(false),
});
export type MarryRequest = z.infer<typeof MarryRequestSchema>;

export const DivorceRequestSchema = z.object({ marriageId: IdSchema });
export type DivorceRequest = z.infer<typeof DivorceRequestSchema>;

export const CreateWillRequestSchema = z.object({
  primaryHeirId: IdSchema.nullable(),
  trustFundEnabled: z.boolean(),
});
export type CreateWillRequest = z.infer<typeof CreateWillRequestSchema>;

export const TrustFundDepositRequestSchema = z.object({ amount: MoneySchema });
export type TrustFundDepositRequest = z.infer<typeof TrustFundDepositRequestSchema>;
