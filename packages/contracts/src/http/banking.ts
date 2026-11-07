import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema, PercentageSchema } from '../common/money.js';
import { LoanStatusSchema } from '../enums/index.js';

export const CreditBandSchema = z.enum(['poor', 'fair', 'good', 'very_good', 'excellent']);
export type CreditBand = z.infer<typeof CreditBandSchema>;

export const LoanDtoSchema = z.object({
  id: IdSchema,
  borrowerId: IdSchema,
  lenderType: z.enum(['bank', 'player', 'npc']),
  principal: MoneySchema,
  outstanding: MoneySchema,
  interestRatePct: PercentageSchema,
  termMonths: z.number().int().positive(),
  monthlyPayment: MoneySchema,
  nextDueAt: z.string().datetime().nullable(),
  gracePeriodEnd: z.string().datetime().nullable(),
  collateralPropertyId: IdSchema.nullable(),
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

export const SavingsAccountDtoSchema = z.object({
  id: IdSchema,
  characterId: IdSchema,
  balance: MoneySchema,
  annualRatePct: z.number(),
  interestEarned: MoneySchema,
});
export type SavingsAccountDto = z.infer<typeof SavingsAccountDtoSchema>;

export const SavingsRequestSchema = z.object({
  amount: MoneySchema,
});
export type SavingsRequest = z.infer<typeof SavingsRequestSchema>;

export const BankingOverviewDtoSchema = z.object({
  characterId: IdSchema,
  cash: MoneySchema,
  savings: MoneySchema,
  totalDebt: MoneySchema,
  netWorth: MoneySchema,
  creditScore: z.number().int(),
  creditBand: CreditBandSchema,
  maxLoanAmount: MoneySchema,
  loans: z.array(LoanDtoSchema),
  savingsAccount: SavingsAccountDtoSchema,
});
export type BankingOverviewDto = z.infer<typeof BankingOverviewDtoSchema>;

export const AssetLiabilityReportSchema = z.object({
  assets: z.array(z.object({ label: z.string(), value: MoneySchema })),
  liabilities: z.array(z.object({ label: z.string(), value: MoneySchema })),
  totalAssets: MoneySchema,
  totalLiabilities: MoneySchema,
  netWorth: MoneySchema,
});
export type AssetLiabilityReport = z.infer<typeof AssetLiabilityReportSchema>;
