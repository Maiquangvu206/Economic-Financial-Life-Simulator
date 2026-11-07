import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema, PercentageSchema } from '../common/money.js';
import { LoanStatusSchema } from '../enums/index.js';

export const LoanDtoSchema = z.object({
  id: IdSchema,
  borrowerId: IdSchema,
  lenderType: z.enum(['bank', 'player', 'npc']),
  principal: MoneySchema,
  outstanding: MoneySchema,
  interestRatePct: PercentageSchema,
  gracePeriodEnd: z.string().datetime().nullable(),
  status: LoanStatusSchema,
});
export type LoanDto = z.infer<typeof LoanDtoSchema>;

export const ApplyLoanRequestSchema = z.object({
  amount: MoneySchema,
  termMonths: z.number().int().min(1).max(360),
  collateralPropertyId: IdSchema.optional(),
});
export type ApplyLoanRequest = z.infer<typeof ApplyLoanRequestSchema>;

export const RepayLoanRequestSchema = z.object({
  amount: MoneySchema,
});
export type RepayLoanRequest = z.infer<typeof RepayLoanRequestSchema>;

export const AssetLiabilityReportSchema = z.object({
  assets: z.array(z.object({ label: z.string(), value: MoneySchema })),
  liabilities: z.array(z.object({ label: z.string(), value: MoneySchema })),
  totalAssets: MoneySchema,
  totalLiabilities: MoneySchema,
  netWorth: MoneySchema,
});
export type AssetLiabilityReport = z.infer<typeof AssetLiabilityReportSchema>;
