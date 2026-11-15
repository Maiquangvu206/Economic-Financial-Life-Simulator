import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema, PercentageSchema } from '../common/money.js';
import { LoanStatusSchema } from '../enums/index.js';

export const CreditBandSchema = z.enum(['poor', 'fair', 'good', 'very_good', 'excellent']);
export type CreditBand = z.infer<typeof CreditBandSchema>;

export const LoanCollateralDtoSchema = z.object({
  propertyId: IdSchema,
  propertyType: z.string(),
  currentValue: MoneySchema,
  nodeName: z.string().nullable(),
  status: z.string(),
});
export type LoanCollateralDto = z.infer<typeof LoanCollateralDtoSchema>;

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
  collateral: LoanCollateralDtoSchema.nullable().default(null),
  status: LoanStatusSchema,
  createdAt: z.string().datetime().optional(),
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

export const SavingsTermDtoSchema = z.object({
  termMonths: z.number().int().min(0),
  annualRatePct: z.number(),
  earlyWithdrawPenaltyPct: z.number(),
  label: z.string(),
});
export type SavingsTermDto = z.infer<typeof SavingsTermDtoSchema>;

export const SavingsDepositDtoSchema = z.object({
  id: IdSchema,
  characterId: IdSchema,
  principal: MoneySchema,
  balance: MoneySchema,
  termMonths: z.number().int().min(0),
  annualRatePct: z.number(),
  status: z.enum(['active', 'closed']),
  openedAt: z.string().datetime(),
  maturesAt: z.string().datetime().nullable(),
  interestEarned: MoneySchema,
});
export type SavingsDepositDto = z.infer<typeof SavingsDepositDtoSchema>;

export const SavingsAccountDtoSchema = z.object({
  id: IdSchema,
  characterId: IdSchema,
  balance: MoneySchema,
  annualRatePct: z.number(),
  interestEarned: MoneySchema,
});
export type SavingsAccountDto = z.infer<typeof SavingsAccountDtoSchema>;

export const SavingsDepositRequestSchema = z.object({
  amount: MoneySchema,
  termMonths: z.number().int().min(0).optional().default(0),
});
export type SavingsDepositRequest = z.infer<typeof SavingsDepositRequestSchema>;

export const SavingsWithdrawRequestSchema = z.object({
  amount: MoneySchema,
  depositId: IdSchema.optional(),
});
export type SavingsWithdrawRequest = z.infer<typeof SavingsWithdrawRequestSchema>;

/** @deprecated use SavingsDepositRequestSchema/SavingsWithdrawRequestSchema */
export const SavingsRequestSchema = z.object({
  amount: MoneySchema,
  termMonths: z.number().int().min(0).optional(),
  depositId: IdSchema.optional(),
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
  baseRatePct: z.number().default(5),
  maxLoanAmount: MoneySchema,
  loans: z.array(LoanDtoSchema),
  savingsAccount: SavingsAccountDtoSchema,
  savingsDeposits: z.array(SavingsDepositDtoSchema).default([]),
  savingsTerms: z.array(SavingsTermDtoSchema).default([]),
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

export const TransferLookupDtoSchema = z.object({
  accountNumber: z.string(),
  cccdMasked: z.string().optional(),
  characterId: IdSchema,
  fullName: z.string(),
  accountTier: z.enum(['standard', 'silver', 'gold', 'platinum', 'diamond']),
});
export type TransferLookupDto = z.infer<typeof TransferLookupDtoSchema>;

export const CreateTransferRequestSchema = z
  .object({
    targetCccd: z.string().optional(),
    toAccountNumber: z.string().min(6).max(20).optional(),
    amount: MoneySchema,
    message: z.string().max(200).optional().default(''),
  })
  .refine((v) => (v.targetCccd && /^\d{12}$/.test(v.targetCccd.replace(/\s+/g, ''))) || !!v.toAccountNumber, {
    message: 'Cần cung cấp targetCccd (12 số) hoặc toAccountNumber.',
  });
export type CreateTransferRequest = z.infer<typeof CreateTransferRequestSchema>;

export const TransferDtoSchema = z.object({
  id: IdSchema,
  direction: z.enum(['in', 'out']),
  counterpartyAccountNumber: z.string(),
  counterpartyName: z.string(),
  amount: MoneySchema,
  message: z.string(),
  status: z.enum(['completed', 'failed']),
  createdAt: z.string().datetime(),
});
export type TransferDto = z.infer<typeof TransferDtoSchema>;

export const TransferResultDtoSchema = z.object({
  transferId: IdSchema,
  toAccountNumber: z.string(),
  toName: z.string(),
  amount: MoneySchema,
  message: z.string(),
  createdAt: z.string().datetime(),
  balanceAfter: MoneySchema,
});
export type TransferResultDto = z.infer<typeof TransferResultDtoSchema>;
