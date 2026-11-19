import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const TaxAssessmentDtoSchema = z.object({
  id: IdSchema,
  taxYear: z.number().int(),
  taxableIncome: MoneySchema,
  taxDue: MoneySchema,
  status: z.enum(['due', 'paid', 'delinquent']),
  dueAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
});
export type TaxAssessmentDto = z.infer<typeof TaxAssessmentDtoSchema>;

export const TaxOverviewDtoSchema = z.object({
  assessments: z.array(TaxAssessmentDtoSchema),
  totalDue: MoneySchema,
  currentYear: z.number().int(),
  auditRisk: z.number().int(),
  audited: z.boolean(),
});
export type TaxOverviewDto = z.infer<typeof TaxOverviewDtoSchema>;

export const PayTaxRequestSchema = z.object({ assessmentId: IdSchema });
export type PayTaxRequest = z.infer<typeof PayTaxRequestSchema>;

export const AuditDtoSchema = z.object({
  id: IdSchema,
  taxYear: z.number().int(),
  riskScore: z.number().int().min(0).max(100),
  status: z.enum(['open', 'cleared', 'penalized']),
  penalty: MoneySchema,
  createdAt: z.string().datetime(),
});
export type AuditDto = z.infer<typeof AuditDtoSchema>;

export const LicenseCompanyStatusDtoSchema = z.object({
  companyId: IdSchema,
  companyName: z.string(),
  ownerCharacterId: IdSchema,
  ownerName: z.string(),
  isOwner: z.boolean(),
  hasActiveLicense: z.boolean(),
  licenseId: IdSchema.nullable(),
  licenseStatus: z.enum(['active', 'suspended', 'revoked']).nullable(),
  licenseType: z.string().nullable(),
  issuedAt: z.string().datetime().nullable(),
});
export type LicenseCompanyStatusDto = z.infer<typeof LicenseCompanyStatusDtoSchema>;

export const UnlicensedCompanyDtoSchema = z.object({
  companyId: IdSchema,
  companyName: z.string(),
  ownerCharacterId: IdSchema,
  ownerName: z.string(),
});
export type UnlicensedCompanyDto = z.infer<typeof UnlicensedCompanyDtoSchema>;

export const PersonalIncomeSourceDtoSchema = z.object({
  kind: z.enum(['employment', 'owner_salary']),
  label: z.string(),
  companyId: IdSchema.nullable().optional(),
  amount: MoneySchema,
  period: z.enum(['month', 'game_day']),
  annualizedAmount: MoneySchema,
});
export type PersonalIncomeSourceDto = z.infer<typeof PersonalIncomeSourceDtoSchema>;

export const PersonalIncomeSummaryDtoSchema = z.object({
  sources: z.array(PersonalIncomeSourceDtoSchema),
  annualTaxableIncome: MoneySchema,
  estimatedTaxDue: MoneySchema,
  taxRatePct: z.number(),
  seasonTaxMultiplier: z.number(),
  currentYear: z.number().int(),
  hasAssessmentForCurrentYear: z.boolean(),
});
export type PersonalIncomeSummaryDto = z.infer<typeof PersonalIncomeSummaryDtoSchema>;

export const TaxOverviewExtDtoSchema = TaxOverviewDtoSchema.extend({
  audits: z.array(AuditDtoSchema),
  licenses: z.array(
    z.object({
      id: IdSchema,
      companyId: IdSchema,
      licenseType: z.string(),
      status: z.enum(['active', 'suspended', 'revoked']),
      issuedAt: z.string().datetime(),
      revokedAt: z.string().datetime().nullable(),
    }),
  ),
  /** Công ty do người chơi sở hữu và trạng thái giấy phép (để xin/cấp phía người chơi). */
  ownedCompanyLicenses: z.array(LicenseCompanyStatusDtoSchema).default([]),
  /** Công ty chưa có giấy phép hoạt động (để phát hiện/tố cáo). */
  unlicensedCompanies: z.array(UnlicensedCompanyDtoSchema).default([]),
  /** Nguồn thu nhập cá nhân hiện tại (phục vụ theo dõi/đối chiếu quyết toán thuế). */
  personalIncome: PersonalIncomeSummaryDtoSchema.optional(),
});
export type TaxOverviewExtDto = z.infer<typeof TaxOverviewExtDtoSchema>;

export const ReportRequestSchema = z
  .object({
    targetCccd: z.string().optional(),
    targetCharacterId: IdSchema.optional(),
    reason: z.string().min(1).max(500),
  })
  .refine((v) => !!v.targetCccd || !!v.targetCharacterId, { message: 'Cần targetCccd hoặc targetCharacterId.' });
export type ReportRequest = z.infer<typeof ReportRequestSchema>;

export const StartAuditRequestSchema = z.object({ taxYear: z.number().int() });
export type StartAuditRequest = z.infer<typeof StartAuditRequestSchema>;

export const AssessRequestSchema = z.object({ taxYear: z.number().int() });
export type AssessRequest = z.infer<typeof AssessRequestSchema>;

export const RevokeLicenseRequestSchema = z.object({ licenseId: IdSchema });
export type RevokeLicenseRequest = z.infer<typeof RevokeLicenseRequestSchema>;

export const IssueLicenseRequestSchema = z.object({ companyId: IdSchema });
export type IssueLicenseRequest = z.infer<typeof IssueLicenseRequestSchema>;

export const ReportUnlicensedCompanyRequestSchema = z.object({
  companyId: IdSchema,
  reason: z.string().min(1).max(500).optional(),
});
export type ReportUnlicensedCompanyRequest = z.infer<typeof ReportUnlicensedCompanyRequestSchema>;
