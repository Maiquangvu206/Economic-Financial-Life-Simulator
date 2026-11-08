import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { CrimeTypeSchema } from '../enums/index.js';

export const UnderworldServiceSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  heat: z.number().int(),
  minPayout: MoneySchema,
  maxPayout: MoneySchema,
  risk: z.number().int(),
});
export type UnderworldService = z.infer<typeof UnderworldServiceSchema>;

export const HeatEventDtoSchema = z.object({
  id: IdSchema,
  delta: z.number().int(),
  reason: z.string(),
  createdAt: z.string().datetime(),
});
export type HeatEventDto = z.infer<typeof HeatEventDtoSchema>;

export const FakeCredentialDtoSchema = z.object({
  id: IdSchema,
  kind: z.string(),
  quality: z.number().int(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});
export type FakeCredentialDto = z.infer<typeof FakeCredentialDtoSchema>;

export const UnderworldOverviewDtoSchema = z.object({
  heatLevel: z.number().int(),
  services: z.array(UnderworldServiceSchema),
  heatEvents: z.array(HeatEventDtoSchema),
  credentials: z.array(FakeCredentialDtoSchema),
});
export type UnderworldOverviewDto = z.infer<typeof UnderworldOverviewDtoSchema>;

export const CommitCrimeRequestSchema = z.object({
  crimeType: CrimeTypeSchema,
});
export type CommitCrimeRequest = z.infer<typeof CommitCrimeRequestSchema>;

export const BuyCredentialRequestSchema = z.object({
  kind: z.enum(['fake_id', 'business_license', 'shell_company']),
});
export type BuyCredentialRequest = z.infer<typeof BuyCredentialRequestSchema>;

export const CrimeResultDtoSchema = z.object({
  crimeType: CrimeTypeSchema,
  payout: MoneySchema,
  caught: z.boolean(),
  heatDelta: z.number().int(),
  fine: MoneySchema,
});
export type CrimeResultDto = z.infer<typeof CrimeResultDtoSchema>;

export const UnderworldEvidenceDtoSchema = z.object({
  id: IdSchema,
  targetCharacterId: IdSchema,
  targetName: z.string().nullable(),
  strength: z.number().int().min(0).max(100),
  description: z.string(),
  status: z.enum(['held', 'sold', 'used', 'submitted']),
  createdAt: z.string().datetime(),
});
export type UnderworldEvidenceDto = z.infer<typeof UnderworldEvidenceDtoSchema>;

export const CollectEvidenceRequestSchema = z.object({
  targetCharacterId: IdSchema,
  price: MoneySchema,
});
export type CollectEvidenceRequest = z.infer<typeof CollectEvidenceRequestSchema>;

export const SellEvidenceRequestSchema = z.object({
  evidenceId: IdSchema,
});
export type SellEvidenceRequest = z.infer<typeof SellEvidenceRequestSchema>;

export const SubmitEvidenceUnderworldRequestSchema = z.object({
  evidenceId: IdSchema,
});
export type SubmitEvidenceUnderworldRequest = z.infer<typeof SubmitEvidenceUnderworldRequestSchema>;

export const StartBlackmailRequestSchema = z.object({
  targetCharacterId: IdSchema,
  monthlyPayment: MoneySchema,
});
export type StartBlackmailRequest = z.infer<typeof StartBlackmailRequestSchema>;

export const BlackmailDtoSchema = z.object({
  id: IdSchema,
  blackmailerId: IdSchema,
  targetId: IdSchema,
  targetName: z.string().nullable(),
  monthlyPayment: MoneySchema,
  status: z.enum(['active', 'ended', 'exposed']),
  expiresAt: z.string().datetime().nullable(),
});
export type BlackmailDto = z.infer<typeof BlackmailDtoSchema>;

export const StingDtoSchema = z.object({
  id: IdSchema,
  targetCharacterId: IdSchema,
  targetName: z.string().nullable(),
  amount: MoneySchema,
  result: z.enum(['pending', 'caught', 'failed']),
  createdAt: z.string().datetime(),
});
export type StingDto = z.infer<typeof StingDtoSchema>;

export const StartStingRequestSchema = z.object({
  targetCharacterId: IdSchema,
  amount: MoneySchema,
});
export type StartStingRequest = z.infer<typeof StartStingRequestSchema>;

export const ProtectionDtoSchema = z.object({
  id: IdSchema,
  kind: z.enum(['bodyguard', 'insurance']),
  coverage: MoneySchema,
  premium: MoneySchema,
  status: z.enum(['active', 'expired']),
  expiresAt: z.string().datetime(),
});
export type ProtectionDto = z.infer<typeof ProtectionDtoSchema>;

export const BuyProtectionRequestSchema = z.object({
  kind: z.enum(['bodyguard', 'insurance']),
});
export type BuyProtectionRequest = z.infer<typeof BuyProtectionRequestSchema>;

export const SweepDtoSchema = z.object({
  id: IdSchema,
  triggerHeat: z.number().int(),
  fine: MoneySchema,
  prisonDays: z.number().int(),
  createdAt: z.string().datetime(),
});
export type SweepDto = z.infer<typeof SweepDtoSchema>;

export const UnderworldOverviewExtDtoSchema = UnderworldOverviewDtoSchema.extend({
  evidences: z.array(UnderworldEvidenceDtoSchema),
  blackmails: z.array(BlackmailDtoSchema),
  stings: z.array(StingDtoSchema),
  protections: z.array(ProtectionDtoSchema),
  sweeps: z.array(SweepDtoSchema),
  undergroundEarned: MoneySchema,
});
export type UnderworldOverviewExtDto = z.infer<typeof UnderworldOverviewExtDtoSchema>;
