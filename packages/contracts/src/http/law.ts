import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { CrimeTypeSchema } from '../enums/index.js';

export const CourtCaseDtoSchema = z.object({
  id: IdSchema,
  defendantId: IdSchema,
  crimeType: CrimeTypeSchema,
  evidenceStrength: z.number().int(),
  status: z.enum(['open', 'trial', 'closed']),
  verdict: z.enum(['guilty', 'not_guilty']).nullable(),
  fine: MoneySchema,
  prisonDays: z.number().int(),
  createdAt: z.string().datetime(),
});
export type CourtCaseDto = z.infer<typeof CourtCaseDtoSchema>;

export const CriminalRecordDtoSchema = z.object({
  id: IdSchema,
  crimeType: CrimeTypeSchema,
  fine: MoneySchema,
  prisonDays: z.number().int(),
  convictedAt: z.string().datetime(),
});
export type CriminalRecordDto = z.infer<typeof CriminalRecordDtoSchema>;

export const BlackmailContractDtoSchema = z.object({
  id: IdSchema,
  blackmailerId: IdSchema,
  targetId: IdSchema,
  monthlyPayment: MoneySchema,
  status: z.enum(['active', 'ended', 'exposed']),
  expiresAt: z.string().datetime().nullable(),
});
export type BlackmailContractDto = z.infer<typeof BlackmailContractDtoSchema>;

export const LawOverviewDtoSchema = z.object({
  courtCases: z.array(CourtCaseDtoSchema),
  criminalRecords: z.array(CriminalRecordDtoSchema),
  blackmailContracts: z.array(BlackmailContractDtoSchema),
  heatLevel: z.number().int(),
});
export type LawOverviewDto = z.infer<typeof LawOverviewDtoSchema>;

export const HireLawyerRequestSchema = z.object({ caseId: IdSchema });
export type HireLawyerRequest = z.infer<typeof HireLawyerRequestSchema>;

export const EvidenceDtoSchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  submittedById: IdSchema,
  strength: z.number().int().min(0).max(100),
  description: z.string(),
  createdAt: z.string().datetime(),
});
export type EvidenceDto = z.infer<typeof EvidenceDtoSchema>;

export const SubmitEvidenceRequestSchema = z.object({
  caseId: IdSchema,
  strength: z.number().int().min(1).max(100),
  description: z.string().min(1).max(500),
});
export type SubmitEvidenceRequest = z.infer<typeof SubmitEvidenceRequestSchema>;

export const OpenCaseRequestSchema = z.object({
  crimeType: CrimeTypeSchema,
});
export type OpenCaseRequest = z.infer<typeof OpenCaseRequestSchema>;

export const TrialDtoSchema = z.object({
  caseId: IdSchema,
  aiProposal: z.enum(['guilty', 'not_guilty']),
  finalVerdict: z.enum(['guilty', 'not_guilty']),
  reason: z.string(),
  fine: MoneySchema,
  prisonDays: z.number().int(),
  evidenceStrength: z.number().int(),
});
export type TrialDto = z.infer<typeof TrialDtoSchema>;

export const LawOverviewExtDtoSchema = LawOverviewDtoSchema.extend({
  evidences: z.array(EvidenceDtoSchema),
});
export type LawOverviewExtDto = z.infer<typeof LawOverviewExtDtoSchema>;
