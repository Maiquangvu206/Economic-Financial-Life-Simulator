import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema, PercentageSchema } from '../common/money.js';
import { LoanStatusSchema } from '../enums/index.js';

export const CreditBandSchema = z.enum(['poor', 'fair', 'good', 'very_good', 'excellent']);
export type CreditBand = z.infer<typeof CreditBandSchema>;

export const LoanCollateralKindSchema = z.enum(['property', 'company']);
export type LoanCollateralKind = z.infer<typeof LoanCollateralKindSchema>;

export const LoanCollateralDtoSchema = z.object({
  kind: LoanCollateralKindSchema.default('property'),
  // property collateral
  propertyId: IdSchema.nullable().optional(),
  propertyType: z.string().nullable().optional(),
  nodeName: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  // company collateral
  companyId: IdSchema.nullable().optional(),
  companyName: z.string().nullable().optional(),
  companyIndustry: z.string().nullable().optional(),
  // shared
  currentValue: MoneySchema,
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
  collateralType: LoanCollateralKindSchema.nullable().optional(),
  collateralPropertyId: IdSchema.nullable(),
  collateralCompanyId: IdSchema.nullable().optional(),
  collateral: LoanCollateralDtoSchema.nullable().default(null),
  status: LoanStatusSchema,
  createdAt: z.string().datetime().optional(),
});
export type LoanDto = z.infer<typeof LoanDtoSchema>;

export const ApplyLoanRequestSchema = z
  .object({
    amount: MoneySchema,
    termMonths: z.number().int().min(1).max(360),
    collateralType: LoanCollateralKindSchema.optional(),
    collateralPropertyId: IdSchema.optional(),
    collateralCompanyId: IdSchema.optional(),
  })
  .refine(
    (v) => !(v.collateralPropertyId && v.collateralCompanyId),
    { message: 'Chỉ được chọn một tài sản thế chấp (bất động sản hoặc công ty).' },
  )
  .refine(
    (v) => !v.collateralType || (v.collateralType === 'property' ? !!v.collateralPropertyId : !!v.collateralCompanyId),
    { message: 'Thiếu tài sản thế chấp tương ứng với loại thế chấp đã chọn.' },
  );
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

export const SavingsWithdrawInterestRequestSchema = z.object({
  depositId: IdSchema,
});
export type SavingsWithdrawInterestRequest = z.infer<typeof SavingsWithdrawInterestRequestSchema>;

/** @deprecated use SavingsDepositRequestSchema/SavingsWithdrawRequestSchema */
export const SavingsRequestSchema = z.object({
  amount: MoneySchema,
  termMonths: z.number().int().min(0).optional(),
  depositId: IdSchema.optional(),
});
export type SavingsRequest = z.infer<typeof SavingsRequestSchema>;

export const LoanCollateralOptionDtoSchema = z.object({
  kind: LoanCollateralKindSchema,
  id: IdSchema,
  name: z.string(),
  value: MoneySchema,
  ltvPct: z.number(),
  maxLoanAmount: MoneySchema,
  subtitle: z.string().nullable().optional(),
  encumbered: z.boolean().optional(),
});
export type LoanCollateralOptionDto = z.infer<typeof LoanCollateralOptionDtoSchema>;

export const LoanLimitBreakdownDtoSchema = z.object({
  cash: MoneySchema,
  savings: MoneySchema,
  realEstate: MoneySchema,
  companies: MoneySchema,
  assetBase: MoneySchema,
  creditScore: z.number().int(),
  scoreFactor: z.number(),
  unsecuredLimit: MoneySchema,
  maxLoanAmount: MoneySchema,
});
export type LoanLimitBreakdownDto = z.infer<typeof LoanLimitBreakdownDtoSchema>;

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
  loanLimit: LoanLimitBreakdownDtoSchema.optional(),
  collateralOptions: z.array(LoanCollateralOptionDtoSchema).default([]),
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

export const AccountHistoryItemDtoSchema = z.object({
  id: IdSchema,
  transactionId: IdSchema,
  accountKind: z.enum(['cash', 'savings']),
  delta: MoneySchema,
  kind: z.string(),
  description: z.string(),
  referenceType: z.string().nullable(),
  referenceId: IdSchema.nullable(),
  createdAt: z.string().datetime(),
});
export type AccountHistoryItemDto = z.infer<typeof AccountHistoryItemDtoSchema>;

export const AccountHistoryResponseDtoSchema = z.object({
  items: z.array(AccountHistoryItemDtoSchema),
});
export type AccountHistoryResponseDto = z.infer<typeof AccountHistoryResponseDtoSchema>;
