import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const HealthInsuranceEnrollmentDtoSchema = z.object({
  isActive: z.boolean(),
  contributionRatePct: z.number(),
  isMandatory: z.boolean(),
  enrolledGameYear: z.number().int().nullable(),
  enrolledGameDay: z.number().int().nullable(),
  updatedAt: z.string().datetime().nullable().optional(),
});
export type HealthInsuranceEnrollmentDto = z.infer<typeof HealthInsuranceEnrollmentDtoSchema>;

export const WellnessDailyDtoSchema = z.object({
  gameYear: z.number().int(),
  gameDay: z.number().int(),
  homeRestCount: z.number().int(),
  homeRestRemaining: z.number().int(),
  medicalCount: z.number().int(),
  medicalRemaining: z.number().int(),
  lastHomeRestMinute: z.number().int().nullable(),
  lastMedicalMinute: z.number().int().nullable(),
  entertainmentCounts: z.record(z.string(), z.number().int()).default({}),
});
export type WellnessDailyDto = z.infer<typeof WellnessDailyDtoSchema>;

export const WelfareSupportTypeSchema = z.enum(['unemployment', 'low_income', 'low_energy']);
export type WelfareSupportType = z.infer<typeof WelfareSupportTypeSchema>;

export const WelfareSupportStatusDtoSchema = z.object({
  type: WelfareSupportTypeSchema,
  label: z.string(),
  eligible: z.boolean(),
  claimedThisPeriod: z.boolean(),
  periodKey: z.string(),
  estimatedAmount: MoneySchema,
  reason: z.string().nullable().optional(),
});
export type WelfareSupportStatusDto = z.infer<typeof WelfareSupportStatusDtoSchema>;

export const MedicalVisitConfigDtoSchema = z.object({
  energyGain: z.number().int(),
  baseCost: MoneySchema,
  discountedCost: MoneySchema,
  dailyLimit: z.number().int(),
  cooldownMinutes: z.number().int(),
});
export type MedicalVisitConfigDto = z.infer<typeof MedicalVisitConfigDtoSchema>;

export const HomeRestStatusDtoSchema = z.object({
  canRest: z.boolean(),
  reason: z.string().nullable().optional(),
  energyGain: z.number().int(),
  cost: MoneySchema,
  durationMinutes: z.number().int(),
  dailyLimit: z.number().int(),
  usedToday: z.number().int(),
  cooldownMinutes: z.number().int(),
  nextAvailableMinute: z.number().int().nullable().optional(),
  hasValidResidence: z.boolean(),
});
export type HomeRestStatusDto = z.infer<typeof HomeRestStatusDtoSchema>;

export const EntertainmentActivityDtoSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  cost: MoneySchema,
  durationMinutes: z.number().int(),
  energyGain: z.number().int(),
  dailyLimit: z.number().int(),
  usedToday: z.number().int(),
  remainingToday: z.number().int(),
  available: z.boolean(),
  unavailableReason: z.string().nullable().optional(),
  seasonal: z.boolean(),
  season: z.string().nullable().optional(),
});
export type EntertainmentActivityDto = z.infer<typeof EntertainmentActivityDtoSchema>;

export const HealthWellnessOverviewDtoSchema = z.object({
  healthEnergy: z.number().int().min(0).max(100),
  isAlive: z.boolean(),
  birthProvinceCode: z.string().nullable(),
  birthProvinceName: z.string().nullable(),
  inActiveTrip: z.boolean(),
  activeTripId: IdSchema.nullable().optional(),
  gameTime: z.object({
    year: z.number().int(),
    month: z.number().int(),
    day: z.number().int(),
    dayOfYear: z.number().int(),
    hour: z.number().int(),
    minute: z.number().int(),
    season: z.string(),
    period: z.string(),
  }),
  daily: WellnessDailyDtoSchema,
  insurance: HealthInsuranceEnrollmentDtoSchema.nullable(),
  homeRest: HomeRestStatusDtoSchema,
  medical: MedicalVisitConfigDtoSchema.extend({
    canUse: z.boolean(),
    reason: z.string().nullable().optional(),
    usedToday: z.number().int(),
    remainingToday: z.number().int(),
  }),
  supports: z.array(WelfareSupportStatusDtoSchema),
  entertainment: z.array(EntertainmentActivityDtoSchema),
});
export type HealthWellnessOverviewDto = z.infer<typeof HealthWellnessOverviewDtoSchema>;

export const UpdateHealthInsuranceRequestSchema = z.object({
  isActive: z.boolean(),
  contributionRatePct: z.number().min(0).max(50).optional(),
});
export type UpdateHealthInsuranceRequest = z.infer<typeof UpdateHealthInsuranceRequestSchema>;

export const PerformMedicalVisitResponseSchema = z.object({
  ok: z.boolean(),
  healthEnergy: z.number().int(),
  energyGain: z.number().int(),
  baseCost: MoneySchema,
  discount: MoneySchema,
  paid: MoneySchema,
  usedInsurance: z.boolean(),
  message: z.string(),
});
export type PerformMedicalVisitResponse = z.infer<typeof PerformMedicalVisitResponseSchema>;

export const PerformHomeRestResponseSchema = z.object({
  ok: z.boolean(),
  healthEnergy: z.number().int(),
  energyGain: z.number().int(),
  usedToday: z.number().int(),
  remainingToday: z.number().int(),
  message: z.string(),
});
export type PerformHomeRestResponse = z.infer<typeof PerformHomeRestResponseSchema>;

export const ClaimWelfareSupportRequestSchema = z.object({
  supportType: WelfareSupportTypeSchema,
});
export type ClaimWelfareSupportRequest = z.infer<typeof ClaimWelfareSupportRequestSchema>;

export const ClaimWelfareSupportResponseSchema = z.object({
  ok: z.boolean(),
  supportType: WelfareSupportTypeSchema,
  periodKey: z.string(),
  amount: MoneySchema,
  insuranceBonusApplied: z.boolean(),
  paidFromStateFund: MoneySchema,
  paidFromInsuranceFund: MoneySchema,
  message: z.string(),
});
export type ClaimWelfareSupportResponse = z.infer<typeof ClaimWelfareSupportResponseSchema>;

export const PerformEntertainmentRequestSchema = z.object({
  activityCode: z.string().min(1),
});
export type PerformEntertainmentRequest = z.infer<typeof PerformEntertainmentRequestSchema>;

export const PerformEntertainmentResponseSchema = z.object({
  ok: z.boolean(),
  activityCode: z.string(),
  activityName: z.string(),
  healthEnergy: z.number().int(),
  energyGain: z.number().int(),
  cost: MoneySchema,
  usedToday: z.number().int(),
  remainingToday: z.number().int(),
  message: z.string(),
});
export type PerformEntertainmentResponse = z.infer<typeof PerformEntertainmentResponseSchema>;
