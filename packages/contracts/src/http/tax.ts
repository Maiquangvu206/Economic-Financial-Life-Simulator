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
});
export type TaxOverviewExtDto = z.infer<typeof TaxOverviewExtDtoSchema>;

export const ReportRequestSchema = z.object({
  targetCharacterId: IdSchema,
  reason: z.string().min(1).max(500),
});
export type ReportRequest = z.infer<typeof ReportRequestSchema>;

export const StartAuditRequestSchema = z.object({ taxYear: z.number().int() });
export type StartAuditRequest = z.infer<typeof StartAuditRequestSchema>;

export const AssessRequestSchema = z.object({ taxYear: z.number().int() });
export type AssessRequest = z.infer<typeof AssessRequestSchema>;

export const RevokeLicenseRequestSchema = z.object({ licenseId: IdSchema });
export type RevokeLicenseRequest = z.infer<typeof RevokeLicenseRequestSchema>;
