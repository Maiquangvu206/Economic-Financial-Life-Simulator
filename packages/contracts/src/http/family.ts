import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const CareTierSchema = z.enum(['economy', 'standard', 'premium']);
export type CareTier = z.infer<typeof CareTierSchema>;

export const DependentStatusSchema = z.enum(['none', 'infant', 'child', 'adult', 'lost_custody']);
export type DependentStatus = z.infer<typeof DependentStatusSchema>;

export const ChildDtoSchema = z.object({
  id: IdSchema,
  fullName: z.string(),
  age: z.number().int().min(0),
  isAdopted: z.boolean(),
  isDependent: z.boolean(),
  dependentStatus: DependentStatusSchema,
  wellbeing: z.number().int().min(0).max(100).nullable(),
  careTier: CareTierSchema.nullable(),
  careDebt: MoneySchema,
  unpaidCareDays: z.number().int().min(0),
  parent1Id: IdSchema.nullable(),
  parent1Name: z.string().nullable(),
  parent2Id: IdSchema.nullable(),
  parent2Name: z.string().nullable(),
  custodialParentId: IdSchema.nullable(),
  custodialParentName: z.string().nullable(),
  childSupportPercent: z.number().int().min(0).max(100),
  childSupportPayerId: IdSchema.nullable(),
  childSupportPayerName: z.string().nullable(),
  canChangeCareTier: z.boolean().default(false),
  canInteract: z.boolean().default(false),
  canStudy: z.boolean().default(false),
  canMedicalCheckup: z.boolean().default(false),
});
export type ChildDto = z.infer<typeof ChildDtoSchema>;

export const PregnancyDtoSchema = z.object({
  id: IdSchema,
  motherCharacterId: IdSchema,
  motherName: z.string(),
  fatherCharacterId: IdSchema,
  fatherName: z.string(),
  status: z.enum(['active', 'completed', 'miscarried', 'cancelled']),
  startGameYear: z.number().int(),
  startGameDay: z.number().int(),
  dueGameYear: z.number().int(),
  dueGameDay: z.number().int(),
  healthWarningDays: z.number().int().min(0),
  childId: IdSchema.nullable(),
  miscarriageReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PregnancyDto = z.infer<typeof PregnancyDtoSchema>;

export const BirthProposalDtoSchema = z.object({
  id: IdSchema,
  proposerCharacterId: IdSchema,
  proposerName: z.string(),
  partnerCharacterId: IdSchema,
  partnerName: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected', 'cancelled']),
  createdAt: z.string().datetime(),
  respondedAt: z.string().datetime().nullable(),
});
export type BirthProposalDto = z.infer<typeof BirthProposalDtoSchema>;

export const AdoptableChildDtoSchema = z.object({
  id: IdSchema,
  fullName: z.string(),
  age: z.number().int().min(0),
  wellbeing: z.number().int().min(0).max(100).nullable(),
});
export type AdoptableChildDto = z.infer<typeof AdoptableChildDtoSchema>;

export const AdoptionApplicationDtoSchema = z.object({
  id: IdSchema,
  applicantCharacterId: IdSchema,
  applicantName: z.string(),
  spouseCharacterId: IdSchema.nullable(),
  spouseName: z.string().nullable(),
  childId: IdSchema,
  childName: z.string(),
  status: z.enum(['pending_spouse_approval', 'pending_review', 'completed', 'cancelled', 'rejected']),
  appliedGameYear: z.number().int(),
  appliedGameDay: z.number().int(),
  reviewCompleteGameYear: z.number().int(),
  reviewCompleteGameDay: z.number().int(),
  spouseApproved: z.boolean().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type AdoptionApplicationDto = z.infer<typeof AdoptionApplicationDtoSchema>;

export const FamilyOverviewDtoSchema = z.object({
  children: z.array(ChildDtoSchema),
  pregnancies: z.array(PregnancyDtoSchema),
  birthProposals: z.array(BirthProposalDtoSchema),
  adoptionApplications: z.array(AdoptionApplicationDtoSchema),
  adoptableChildren: z.array(AdoptableChildDtoSchema),
  canProposeBirth: z.boolean(),
  canApplyAdoption: z.boolean(),
  birthBlockedReason: z.string().nullable().optional(),
  adoptionBlockedReason: z.string().nullable().optional(),
});
export type FamilyOverviewDto = z.infer<typeof FamilyOverviewDtoSchema>;

export const BirthProposeRequestSchema = z.object({
  // optional note/metadata reserved
}).default({});
export type BirthProposeRequest = z.infer<typeof BirthProposeRequestSchema>;

export const BirthRespondRequestSchema = z.object({
  proposalId: IdSchema,
  accept: z.boolean(),
});
export type BirthRespondRequest = z.infer<typeof BirthRespondRequestSchema>;

export const AdoptionApplyRequestSchema = z.object({
  childId: IdSchema,
});
export type AdoptionApplyRequest = z.infer<typeof AdoptionApplyRequestSchema>;

export const AdoptionRespondRequestSchema = z.object({
  applicationId: IdSchema,
  accept: z.boolean(),
});
export type AdoptionRespondRequest = z.infer<typeof AdoptionRespondRequestSchema>;

export const ChildCareActionSchema = z.enum(['interact', 'study', 'medical_checkup', 'extra_support']);
export type ChildCareAction = z.infer<typeof ChildCareActionSchema>;

export const ChildCareRequestSchema = z.object({
  childId: IdSchema,
  action: ChildCareActionSchema,
  amount: MoneySchema.optional(),
  careTier: CareTierSchema.optional(),
});
export type ChildCareRequest = z.infer<typeof ChildCareRequestSchema>;

export const SetChildCareTierRequestSchema = z.object({
  childId: IdSchema,
  careTier: CareTierSchema,
});
export type SetChildCareTierRequest = z.infer<typeof SetChildCareTierRequestSchema>;

export const DivorceCustodyTermsSchema = z.object({
  mode: z.enum(['agree', 'system']),
  custodialParentId: IdSchema.optional(),
}).superRefine((v, ctx) => {
  if (v.mode === 'agree' && !v.custodialParentId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'custodialParentId is required when mode=agree', path: ['custodialParentId'] });
  }
});
export type DivorceCustodyTerms = z.infer<typeof DivorceCustodyTermsSchema>;