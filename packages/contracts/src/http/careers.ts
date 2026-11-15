import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { IndustryTypeSchema } from '../enums/index.js';

export const UniversityDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  degreeCode: z.string(),
  field: IndustryTypeSchema,
  tuition: MoneySchema,
  durationMonths: z.number().int().positive(),
  enrolled: z.boolean(),
});
export type UniversityDto = z.infer<typeof UniversityDtoSchema>;

export const DegreeDtoSchema = z.object({
  id: IdSchema,
  universityId: IdSchema.optional(),
  universityName: z.string().optional(),
  degreeCode: z.string(),
  field: z.string(),
  status: z.enum(['enrolled', 'graduated', 'dropped']),
  enrolledAt: z.string().datetime(),
  graduatesAt: z.string().datetime(),
  progressPct: z.number().min(0).max(100).optional(),
  canEarlyGraduate: z.boolean().optional(),
  earlyGraduateMinProgressPct: z.number().optional(),
});
export type DegreeDto = z.infer<typeof DegreeDtoSchema>;

export const JobDtoSchema = z.object({
  id: IdSchema,
  title: z.string(),
  industry: IndustryTypeSchema,
  baseSalary: MoneySchema,
  requiredDegree: z.string().nullable(),
  minCreditScore: z.number().int(),
  energyCost: z.number().int(),
  openings: z.number().int(),
  eligible: z.boolean(),
  blocker: z.string().nullable(),
});
export type JobDto = z.infer<typeof JobDtoSchema>;

export const EmploymentDtoSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  title: z.string(),
  industry: IndustryTypeSchema,
  salary: MoneySchema,
  status: z.enum(['active', 'resigned', 'fired']),
  hiredAt: z.string().datetime(),
});
export type EmploymentDto = z.infer<typeof EmploymentDtoSchema>;

export const CareersOverviewDtoSchema = z.object({
  jobs: z.array(JobDtoSchema),
  universities: z.array(UniversityDtoSchema),
  degrees: z.array(DegreeDtoSchema),
  employment: EmploymentDtoSchema.nullable(),
});
export type CareersOverviewDto = z.infer<typeof CareersOverviewDtoSchema>;

export const ApplyJobRequestSchema = z.object({ jobId: IdSchema });
export type ApplyJobRequest = z.infer<typeof ApplyJobRequestSchema>;

export const EnrollUniversityRequestSchema = z.object({ universityId: IdSchema });
export type EnrollUniversityRequest = z.infer<typeof EnrollUniversityRequestSchema>;

export const UnlockedFeatureSchema = z.enum([
  'ipo',
  'self_defense',
  'lower_audit_risk',
  'board_seat',
]);
export type UnlockedFeature = z.infer<typeof UnlockedFeatureSchema>;

export const GraduateRequestSchema = z.object({ degreeId: IdSchema });
export type GraduateRequest = z.infer<typeof GraduateRequestSchema>;

export const DropDegreeRequestSchema = z.object({ degreeId: IdSchema });
export type DropDegreeRequest = z.infer<typeof DropDegreeRequestSchema>;

export const GraduationDtoSchema = z.object({
  degree: DegreeDtoSchema,
  unlockedFeatures: z.array(UnlockedFeatureSchema),
  skillProgress: z.array(
    z.object({
      skill: z.string(),
      progress: z.number().int().min(0).max(100),
    }),
  ),
});
export type GraduationDto = z.infer<typeof GraduationDtoSchema>;

export const EarlyGraduateRequestSchema = z.object({ degreeId: IdSchema });
export type EarlyGraduateRequest = z.infer<typeof EarlyGraduateRequestSchema>;

export const EarlyGradQuestionDtoSchema = z.object({
  id: z.number().int(),
  question: z.string(),
  options: z.array(z.string()),
});
export type EarlyGradQuestionDto = z.infer<typeof EarlyGradQuestionDtoSchema>;

export const EarlyGraduateStartResponseSchema = z.object({
  testId: IdSchema,
  degreeId: IdSchema,
  title: z.string(),
  questions: z.array(EarlyGradQuestionDtoSchema),
  expiresAt: z.string().datetime(),
  requiredScore: z.number().int(),
  totalQuestions: z.number().int(),
});
export type EarlyGraduateStartResponse = z.infer<typeof EarlyGraduateStartResponseSchema>;

export const EarlyGraduateSubmitRequestSchema = z.object({
  degreeId: IdSchema,
  testId: IdSchema,
  answers: z.array(z.object({ questionId: z.number().int(), selectedIndex: z.number().int() })),
});
export type EarlyGraduateSubmitRequest = z.infer<typeof EarlyGraduateSubmitRequestSchema>;

export const EarlyGraduateResultDtoSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  requiredScore: z.number().int().min(0).max(100),
  correctCount: z.number().int().min(0).max(5).optional(),
  totalQuestions: z.number().int().min(1).max(5).optional(),
  message: z.string(),
  graduation: GraduationDtoSchema.nullable(),
});
export type EarlyGraduateResultDto = z.infer<typeof EarlyGraduateResultDtoSchema>;

// Admin education config
export const AdminUniversityDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  degreeCode: z.string(),
  field: IndustryTypeSchema,
  tuition: MoneySchema,
  durationMonths: z.number().int().positive(),
  postGradSalary: MoneySchema.nullable().optional(),
});
export type AdminUniversityDto = z.infer<typeof AdminUniversityDtoSchema>;

export const UpsertUniversityRequestSchema = z.object({
  name: z.string().min(1),
  degreeCode: z.string().min(1),
  field: IndustryTypeSchema,
  tuitionMinor: z.number().int().nonnegative(),
  durationMonths: z.number().int().positive(),
  postGradSalaryMinor: z.number().int().nonnegative().optional(),
});
export type UpsertUniversityRequest = z.infer<typeof UpsertUniversityRequestSchema>;

export const AdminJobDtoSchema = z.object({
  id: IdSchema,
  title: z.string(),
  industry: IndustryTypeSchema,
  baseSalary: MoneySchema,
  requiredDegree: z.string().nullable(),
  minCreditScore: z.number().int(),
  energyCost: z.number().int(),
  openings: z.number().int(),
});
export type AdminJobDto = z.infer<typeof AdminJobDtoSchema>;

export const UpsertJobRequestSchema = z.object({
  title: z.string().min(1),
  industry: IndustryTypeSchema,
  baseSalaryMinor: z.number().int().nonnegative(),
  requiredDegree: z.string().nullable().optional(),
  minCreditScore: z.number().int().optional(),
  energyCost: z.number().int().optional(),
  openings: z.number().int().optional(),
});
export type UpsertJobRequest = z.infer<typeof UpsertJobRequestSchema>;

export const AdminEducationConfigDtoSchema = z.object({
  universities: z.array(AdminUniversityDtoSchema),
  jobs: z.array(AdminJobDtoSchema),
});
export type AdminEducationConfigDto = z.infer<typeof AdminEducationConfigDtoSchema>;

export const CareersOverviewExtDtoSchema = CareersOverviewDtoSchema.extend({
  unlockedFeatures: z.array(UnlockedFeatureSchema),
  tuitionPaidTotal: z.number(),
});
export type CareersOverviewExtDto = z.infer<typeof CareersOverviewExtDtoSchema>;
