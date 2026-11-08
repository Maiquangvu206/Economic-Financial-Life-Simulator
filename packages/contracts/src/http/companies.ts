import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { IndustryTypeSchema } from '../enums/index.js';

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
});
export type CreateCompanyRequest = z.infer<typeof CreateCompanyRequestSchema>;

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
