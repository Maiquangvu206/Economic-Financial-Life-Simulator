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
  degreeCode: z.string(),
  field: z.string(),
  status: z.enum(['enrolled', 'graduated', 'dropped']),
  enrolledAt: z.string().datetime(),
  graduatesAt: z.string().datetime(),
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
