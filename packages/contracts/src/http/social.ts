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

export const MarriageProposalDtoSchema = z.object({
  id: IdSchema,
  proposerCharacterId: IdSchema,
  proposerName: z.string(),
  targetCharacterId: IdSchema,
  targetName: z.string(),
  prenupEnabled: z.boolean(),
  status: z.enum(['pending', 'accepted', 'rejected', 'cancelled']),
  createdAt: z.string().datetime(),
  respondedAt: z.string().datetime().nullable(),
});
export type MarriageProposalDto = z.infer<typeof MarriageProposalDtoSchema>;

export const DivorceProposalDtoSchema = z.object({
  id: IdSchema,
  marriageId: IdSchema,
  requesterCharacterId: IdSchema,
  requesterName: z.string(),
  otherCharacterId: IdSchema,
  otherName: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected', 'cancelled']),
  createdAt: z.string().datetime(),
  respondedAt: z.string().datetime().nullable(),
});
export type DivorceProposalDto = z.infer<typeof DivorceProposalDtoSchema>;

export const FamilyMemberDtoSchema = z.object({
  characterId: IdSchema,
  characterName: z.string(),
  relationship: z.string(),
  parentId: IdSchema.nullable(),
  generationLevel: z.number().int(),
  inheritancePct: z.number(),
});
export type FamilyMemberDto = z.infer<typeof FamilyMemberDtoSchema>;

export const WillHeirDtoSchema = z.object({
  beneficiaryCccd: z.string().optional(),
  beneficiaryName: z.string().nullable().optional(),
  characterId: IdSchema.optional(),
  characterName: z.string().optional(),
  sharePct: z.number().positive().max(100),
  relationship: z.string(),
  note: z.string().nullable().optional(),
});
export type WillHeirDto = z.infer<typeof WillHeirDtoSchema>;

export const WillDtoSchema = z.object({
  id: IdSchema.nullable(),
  primaryHeirId: IdSchema.nullable(),
  primaryHeirName: z.string().nullable(),
  heirs: z.array(WillHeirDtoSchema).default([]),
  trustFundEnabled: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
});
export type WillDto = z.infer<typeof WillDtoSchema>;

export const TrustFundDtoSchema = z.object({
  id: IdSchema,
  beneficiaryId: IdSchema.nullable(),
  beneficiaryName: z.string().nullable(),
  beneficiaryCccd: z.string().nullable().optional(),
  beneficiaries: z
    .array(
      z.object({
        beneficiaryCccd: z.string(),
        beneficiaryName: z.string().nullable().optional(),
        sharePct: z.number().positive().max(100),
      }),
    )
    .optional(),
  balance: MoneySchema,
});
export type TrustFundDto = z.infer<typeof TrustFundDtoSchema>;

export const SocialOverviewDtoSchema = z.object({
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']),
  spouse: z.object({ characterId: IdSchema, characterName: z.string() }).nullable(),
  marriages: z.array(MarriageDtoSchema),
  marriageProposals: z.array(MarriageProposalDtoSchema).default([]),
  divorceProposals: z.array(DivorceProposalDtoSchema).default([]),
  family: z.array(FamilyMemberDtoSchema),
  will: WillDtoSchema,
  trustFunds: z.array(TrustFundDtoSchema),
  trustFundTotal: MoneySchema,
});
export type SocialOverviewDto = z.infer<typeof SocialOverviewDtoSchema>;

export const MarryRequestSchema = z
  .object({
    spouseCccd: z.string().optional(),
    spouseCharacterId: IdSchema.optional(),
    prenupEnabled: z.boolean().default(false),
  })
  .refine((v) => !!v.spouseCccd || !!v.spouseCharacterId, { message: 'Cần spouseCccd hoặc spouseCharacterId.' });
export type MarryRequest = z.infer<typeof MarryRequestSchema>;

export const ProposeMarriageRequestSchema = MarryRequestSchema;
export type ProposeMarriageRequest = MarryRequest;

export const DivorceRequestSchema = z.object({ marriageId: IdSchema });
export type DivorceRequest = z.infer<typeof DivorceRequestSchema>;

export const ProposeDivorceRequestSchema = DivorceRequestSchema;
export type ProposeDivorceRequest = DivorceRequest;

export const RespondMarriageProposalRequestSchema = z.object({
  proposalId: IdSchema,
  accept: z.boolean(),
});
export type RespondMarriageProposalRequest = z.infer<typeof RespondMarriageProposalRequestSchema>;

export const RespondDivorceProposalRequestSchema = z.object({
  proposalId: IdSchema,
  accept: z.boolean(),
});
export type RespondDivorceProposalRequest = z.infer<typeof RespondDivorceProposalRequestSchema>;

export const CreateWillHeirInputSchema = z
  .object({
    beneficiaryCccd: z.string().optional(),
    characterId: IdSchema.optional(),
    sharePct: z.number().positive().max(100),
    relationship: z.string().min(1).max(50).optional(),
    note: z.string().max(200).nullable().optional(),
  })
  .refine((v) => !!v.beneficiaryCccd || !!v.characterId, { message: 'Cần beneficiaryCccd hoặc characterId.' });
export type CreateWillHeirInput = z.infer<typeof CreateWillHeirInputSchema>;

export const CreateWillRequestSchema = z.object({
  heirs: z.array(CreateWillHeirInputSchema).max(20).optional(),
  primaryHeirId: IdSchema.nullable().optional(),
  trustFundEnabled: z.boolean(),
});
export type CreateWillRequest = z.infer<typeof CreateWillRequestSchema>;

export const TrustFundBeneficiaryInputSchema = z.object({
  beneficiaryCccd: z.string(),
  sharePct: z.number().positive().max(100),
});
export type TrustFundBeneficiaryInput = z.infer<typeof TrustFundBeneficiaryInputSchema>;

export const TrustFundDepositRequestSchema = z.object({
  amount: MoneySchema,
  beneficiaries: z.array(TrustFundBeneficiaryInputSchema).max(20).optional(),
});
export type TrustFundDepositRequest = z.infer<typeof TrustFundDepositRequestSchema>;
