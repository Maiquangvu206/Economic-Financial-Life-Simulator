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
