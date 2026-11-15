import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const MayorTermStatusSchema = z.enum(['none', 'active', 'expired', 'revoked']);

export const ElectionDtoSchema = z.object({
  id: IdSchema,
  office: z.enum(['mayor']),
  status: z.enum(['open', 'ended']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  winnerCandidateId: IdSchema.nullable(),
  youVoted: z.boolean(),
  youCandidateId: IdSchema.nullable(),
  // Nhiệm kỳ Thị trưởng (Pha A/C)
  winnerCharacterId: IdSchema.nullable().optional(),
  winnerCharacterName: z.string().nullable().optional(),
  termDays: z.number().int().nonnegative().nullable().optional(),
  termStartedAt: z.string().datetime().nullable().optional(),
  termEndsAt: z.string().datetime().nullable().optional(),
  termStatus: MayorTermStatusSchema.optional(),
  revokedAt: z.string().datetime().nullable().optional(),
  revokedReason: z.string().nullable().optional(),
});
export type ElectionDto = z.infer<typeof ElectionDtoSchema>;

export const CandidateDtoSchema = z.object({
  id: IdSchema,
  characterId: IdSchema,
  name: z.string(),
  votes: z.number().int().nonnegative(),
  donations: MoneySchema,
  score: z.number().int().nonnegative(),
  isMe: z.boolean(),
});
export type CandidateDto = z.infer<typeof CandidateDtoSchema>;

export const MayorConfigDtoSchema = z.object({
  enabled: z.boolean(),
  termDays: z.number().int().nonnegative(),
  salaryMinor: z.number().int().nonnegative(),
  salaryIntervalGameDays: z.number().int().positive(),
  perkTaxDiscountPct: z.number().int().min(0).max(100),
  policyCooldownMinutes: z.number().int().nonnegative(),
  policyCostMinor: z.number().int().nonnegative(),
  treasurySpendLimitMinor: z.number().int().nonnegative(),
  otRateAdjustMinPct: z.number().int(),
  otRateAdjustMaxPct: z.number().int(),
  otRateAdjustStepPct: z.number().int().positive(),
  welfareBonusPerCitizenMinor: z.number().int().nonnegative(),
  welfareBonusMaxCitizens: z.number().int().nonnegative(),
});
export type MayorConfigDto = z.infer<typeof MayorConfigDtoSchema>;

export const MayorStateDtoSchema = z.object({
  active: z.boolean(),
  electionId: IdSchema.nullable(),
  characterId: IdSchema.nullable(),
  characterName: z.string().nullable(),
  userId: IdSchema.nullable(),
  termStatus: MayorTermStatusSchema,
  termStartedAt: z.string().datetime().nullable(),
  termEndsAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  revokedReason: z.string().nullable(),
  isYou: z.boolean(),
  config: MayorConfigDtoSchema,
});
export type MayorStateDto = z.infer<typeof MayorStateDtoSchema>;

export const PoliticsOverviewDtoSchema = z.object({
  election: ElectionDtoSchema.nullable(),
  candidates: z.array(CandidateDtoSchema),
  mayor: MayorStateDtoSchema.nullable(),
});
export type PoliticsOverviewDto = z.infer<typeof PoliticsOverviewDtoSchema>;

export const CreateElectionRequestSchema = z.object({
  office: z.enum(['mayor']).default('mayor'),
  endsAt: z.string().datetime().optional(),
  termDays: z.number().int().positive().max(365).optional(),
});
export type CreateElectionRequest = z.infer<typeof CreateElectionRequestSchema>;

export const DeclareCandidacyRequestSchema = z.object({
  electionId: IdSchema,
  name: z.string().min(2).max(80),
});
export type DeclareCandidacyRequest = z.infer<typeof DeclareCandidacyRequestSchema>;

export const VoteRequestSchema = z.object({
  electionId: IdSchema,
  candidateId: IdSchema,
});
export type VoteRequest = z.infer<typeof VoteRequestSchema>;

export const DonateRequestSchema = z.object({
  candidateId: IdSchema,
  amount: MoneySchema,
});
export type DonateRequest = z.infer<typeof DonateRequestSchema>;

// --- Pha B/C: hành động Thị trưởng & quản trị ---
export const MayorPolicyActionTypeSchema = z.enum([
  'adjust_ot_rate',
  'treasury_welfare_bonus',
  'support_companies',
]);
export type MayorPolicyActionType = z.infer<typeof MayorPolicyActionTypeSchema>;

export const MayorPolicyActionRequestSchema = z.object({
  type: MayorPolicyActionTypeSchema,
  // adjust_ot_rate
  otRatePercent: z.number().int().optional(),
  // treasury_welfare_bonus
  amountPerCitizen: z.number().int().nonnegative().optional(),
  maxCitizens: z.number().int().positive().optional(),
  // support_companies (from state fund): support selected companies or all active/ipo
  companyIds: z.array(IdSchema).max(200).optional(),
  supportAllCompanies: z.boolean().optional(),
  amountPerCompanyMinor: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});
export type MayorPolicyActionRequest = z.infer<typeof MayorPolicyActionRequestSchema>;

export const RevokeMayorRequestSchema = z.object({
  electionId: IdSchema.optional(),
  reason: z.string().min(5).max(1000),
});
export type RevokeMayorRequest = z.infer<typeof RevokeMayorRequestSchema>;

export const UpdateMayorConfigRequestSchema = z.object({
  enabled: z.boolean().optional(),
  termDays: z.number().int().positive().max(365).optional(),
  salaryMinor: z.number().int().nonnegative().optional(),
  salaryIntervalGameDays: z.number().int().positive().max(30).optional(),
  perkTaxDiscountPct: z.number().int().min(0).max(100).optional(),
  policyCooldownMinutes: z.number().int().min(0).max(1440).optional(),
  policyCostMinor: z.number().int().nonnegative().optional(),
  treasurySpendLimitMinor: z.number().int().nonnegative().optional(),
  otRateAdjustMinPct: z.number().int().min(0).max(1000).optional(),
  otRateAdjustMaxPct: z.number().int().min(0).max(1000).optional(),
  otRateAdjustStepPct: z.number().int().positive().max(100).optional(),
  welfareBonusPerCitizenMinor: z.number().int().nonnegative().optional(),
  welfareBonusMaxCitizens: z.number().int().nonnegative().max(2000).optional(),
});
export type UpdateMayorConfigRequest = z.infer<typeof UpdateMayorConfigRequestSchema>;

export const MayorActionLogDtoSchema = z.object({
  id: IdSchema,
  electionId: IdSchema.nullable(),
  actionType: z.string(),
  status: z.string(),
  amountMinor: z.number().int().nullable(),
  reason: z.string().nullable(),
  payload: z.record(z.unknown()),
  actorCharacterName: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type MayorActionLogDto = z.infer<typeof MayorActionLogDtoSchema>;
