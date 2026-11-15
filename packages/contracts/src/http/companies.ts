import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { IndustryTypeSchema } from '../enums/index.js';

export const CompanyPremisesTypeSchema = z.enum(['land_core', 'land_province', 'company_property']);
export type CompanyPremisesType = z.infer<typeof CompanyPremisesTypeSchema>;

export const CompanyPremisesDtoSchema = z.object({
  type: CompanyPremisesTypeSchema,
  label: z.string(),
  provinceCode: z.string().nullable().optional(),
  corePropertyId: IdSchema.nullable().optional(),
  provinceLandPropertyId: IdSchema.nullable().optional(),
  companyPropertyId: IdSchema.nullable().optional(),
  hostCompanyId: IdSchema.nullable().optional(),
  hostCompanyName: z.string().nullable().optional(),
});
export type CompanyPremisesDto = z.infer<typeof CompanyPremisesDtoSchema>;

export const CompanyDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  industry: IndustryTypeSchema,
  ownerCharacterId: IdSchema,
  ownerName: z.string(),
  cash: MoneySchema,
  valuation: MoneySchema,
  status: z.enum(['active', 'bankrupt', 'ipo']),
  tickerSymbol: z.string().nullable(),
  foundedAt: z.string().datetime(),
  isOwner: z.boolean(),
  premises: CompanyPremisesDtoSchema.nullable().optional(),
  /** Cổ đông (chỉ có khi xem chi tiết công ty). */
  shareholders: z
    .array(
      z.object({
        characterId: IdSchema,
        characterName: z.string(),
        shares: z.number().int().nonnegative(),
        isOwner: z.boolean(),
        isMe: z.boolean(),
        percentage: z.number().nonnegative(),
      }),
    )
    .optional(),
});
export type CompanyDto = z.infer<typeof CompanyDtoSchema>;

export const CreateCompanyRequestSchema = z.object({
  name: z.string().min(3).max(60),
  industry: IndustryTypeSchema,
  initialCapital: MoneySchema,
  premises: z.object({
    type: CompanyPremisesTypeSchema,
    corePropertyId: IdSchema.optional(),
    provinceLandPropertyId: IdSchema.optional(),
    companyPropertyId: IdSchema.optional(),
  }),
});
export type CreateCompanyRequest = z.infer<typeof CreateCompanyRequestSchema>;

export const CompanyPremisesOptionDtoSchema = z.object({
  type: CompanyPremisesTypeSchema,
  id: IdSchema,
  label: z.string(),
  provinceCode: z.string().nullable().optional(),
  provinceName: z.string().nullable().optional(),
  propertyType: z.string().nullable().optional(),
  location: z.object({ x: z.number().int(), y: z.number().int() }).nullable().optional(),
  hostCompanyId: IdSchema.nullable().optional(),
  hostCompanyName: z.string().nullable().optional(),
});
export type CompanyPremisesOptionDto = z.infer<typeof CompanyPremisesOptionDtoSchema>;

export const CompanyPremisesOptionsDtoSchema = z.object({
  land: z.array(CompanyPremisesOptionDtoSchema),
  companyProperties: z.array(CompanyPremisesOptionDtoSchema),
});
export type CompanyPremisesOptionsDto = z.infer<typeof CompanyPremisesOptionsDtoSchema>;

export const CompanyInvestRequestSchema = z.object({
  amount: MoneySchema,
});
export type CompanyInvestRequest = z.infer<typeof CompanyInvestRequestSchema>;

export const CompanyOverviewDtoSchema = z.object({
  companies: z.array(CompanyDtoSchema),
});
export type CompanyOverviewDto = z.infer<typeof CompanyOverviewDtoSchema>;

export const IpoCompanyRequestSchema = z.object({
  companyId: IdSchema.optional(),
  tickerSymbol: z.string().min(1).max(8),
  initialPrice: MoneySchema,
  totalShares: z.number().int().positive(),
});
export type IpoCompanyRequest = z.infer<typeof IpoCompanyRequestSchema>;

export const DividendRequestSchema = z.object({
  companyId: IdSchema.optional(),
  amountPerShare: MoneySchema,
});
export type DividendRequest = z.infer<typeof DividendRequestSchema>;

export const CompanyOperationRequestSchema = z.object({
  amount: MoneySchema,
  note: z.string().max(120).optional(),
});
export type CompanyOperationRequest = z.infer<typeof CompanyOperationRequestSchema>;

export const CompanyEmployeeDtoSchema = z.object({
  employmentId: IdSchema,
  characterId: IdSchema,
  characterName: z.string(),
  jobTitle: z.string(),
  salary: MoneySchema,
  status: z.enum(['active', 'resigned', 'fired']),
  hiredAt: z.string().datetime(),
});
export type CompanyEmployeeDto = z.infer<typeof CompanyEmployeeDtoSchema>;

export const CompanyEmployeesDtoSchema = z.object({
  companyId: IdSchema,
  employees: z.array(CompanyEmployeeDtoSchema),
});
export type CompanyEmployeesDto = z.infer<typeof CompanyEmployeesDtoSchema>;

export const HiringCandidateDtoSchema = z.object({
  id: IdSchema,
  fullName: z.string(),
  roleTitle: z.string(),
  seniority: z.string(),
  proposedSalary: MoneySchema,
  fitScore: z.number().int(),
  riskNote: z.string(),
  aiReason: z.string(),
  status: z.enum(['proposed', 'approved', 'rejected', 'hired']),
});
export type HiringCandidateDto = z.infer<typeof HiringCandidateDtoSchema>;

export const HiringPlanDtoSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  status: z.enum(['pending', 'approved', 'rejected', 'applied', 'cancelled']),
  roleFocus: z.string(),
  headcount: z.number().int(),
  rationale: z.string(),
  aiModel: z.string().nullable(),
  candidates: z.array(HiringCandidateDtoSchema),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  appliedAt: z.string().datetime().nullable(),
});
export type HiringPlanDto = z.infer<typeof HiringPlanDtoSchema>;

export const CreateHiringPlanRequestSchema = z.object({
  roleFocus: z.string().min(1).max(200),
  headcount: z.number().int().min(1).max(20).default(3),
  budget: MoneySchema.optional(),
  context: z.string().max(2000).optional(),
});
export type CreateHiringPlanRequest = z.infer<typeof CreateHiringPlanRequestSchema>;

export const DecideHiringCandidateRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});
export type DecideHiringCandidateRequest = z.infer<typeof DecideHiringCandidateRequestSchema>;

export const CompanyStaffDtoSchema = z.object({
  id: IdSchema,
  fullName: z.string(),
  roleTitle: z.string(),
  salary: MoneySchema,
  status: z.enum(['active', 'fired', 'resigned']),
  hiredAt: z.string().datetime(),
  firedAt: z.string().datetime().nullable(),
});
export type CompanyStaffDto = z.infer<typeof CompanyStaffDtoSchema>;

export const CompanyLedgerEntryDtoSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  entryType: z.enum(['revenue', 'opex', 'payroll', 'tax', 'adjustment', 'fine', 'bribe', 'other']),
  amount: MoneySchema,
  declaredAmount: MoneySchema,
  description: z.string(),
  isEvasion: z.boolean(),
  occurredAt: z.string().datetime(),
});
export type CompanyLedgerEntryDto = z.infer<typeof CompanyLedgerEntryDtoSchema>;

export const CreateLedgerEntryRequestSchema = z.object({
  entryType: z.enum(['revenue', 'opex', 'payroll', 'tax', 'adjustment', 'fine', 'bribe', 'other']),
  amount: MoneySchema,
  declaredAmount: MoneySchema.optional(),
  description: z.string().max(300).optional(),
  isEvasion: z.boolean().optional(),
  applyToCash: z.boolean().optional().default(true),
});
export type CreateLedgerEntryRequest = z.infer<typeof CreateLedgerEntryRequestSchema>;

export const CompanyLedgerDtoSchema = z.object({
  companyId: IdSchema,
  entries: z.array(CompanyLedgerEntryDtoSchema),
  totals: z.object({
    revenue: MoneySchema,
    expense: MoneySchema,
    declaredRevenue: MoneySchema,
    declaredExpense: MoneySchema,
    profit: MoneySchema,
    taxGap: MoneySchema,
  }),
});
export type CompanyLedgerDto = z.infer<typeof CompanyLedgerDtoSchema>;

export const CompanyTaxFilingDtoSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  period: z.string(),
  declaredRevenue: MoneySchema,
  actualRevenue: MoneySchema,
  declaredExpense: MoneySchema,
  actualExpense: MoneySchema,
  taxDue: MoneySchema,
  taxPaid: MoneySchema,
  riskScore: z.number().int(),
  status: z.enum(['draft', 'filed', 'audited', 'penalized']),
  notes: z.string(),
  createdAt: z.string().datetime(),
  filedAt: z.string().datetime().nullable(),
});
export type CompanyTaxFilingDto = z.infer<typeof CompanyTaxFilingDtoSchema>;

export const CreateCompanyTaxFilingRequestSchema = z.object({
  period: z.string().min(3).max(20),
  declareFull: z.boolean().optional().default(true),
  adjustmentDeclaredRevenue: MoneySchema.optional(),
  adjustmentDeclaredExpense: MoneySchema.optional(),
  notes: z.string().max(500).optional(),
});
export type CreateCompanyTaxFilingRequest = z.infer<typeof CreateCompanyTaxFilingRequestSchema>;

export const CompanyHrAccountingDtoSchema = z.object({
  companyId: IdSchema,
  plans: z.array(HiringPlanDtoSchema),
  staff: z.array(CompanyStaffDtoSchema),
  ledger: CompanyLedgerDtoSchema,
  filings: z.array(CompanyTaxFilingDtoSchema),
});
export type CompanyHrAccountingDto = z.infer<typeof CompanyHrAccountingDtoSchema>;
