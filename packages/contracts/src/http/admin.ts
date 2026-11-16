import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const MacroSnapshotDtoSchema = z.object({
  tick: z.number().int().nonnegative(),
  inGameYear: z.number().int(),
  moneySupply: MoneySchema,
  inflationPct: z.number(),
  cpi: z.number(),
  marketCap: MoneySchema,
  concurrentUsers: z.number().int().nonnegative(),
  activeCourtCases: z.number().int().nonnegative(),
  stateFundBalance: MoneySchema.optional(),
  generatedAt: z.string().datetime(),
});
export type MacroSnapshotDto = z.infer<typeof MacroSnapshotDtoSchema>;

export const AdjustStateFundRequestSchema = z.object({
  deltaMinor: z.number().int().refine((v) => v !== 0, "deltaMinor must be non-zero"),
  reason: z.string().min(3).max(500),
});
export type AdjustStateFundRequest = z.infer<typeof AdjustStateFundRequestSchema>;

export const StateFundSnapshotDtoSchema = z.object({
  balance: MoneySchema,
  updatedAt: z.string().datetime().nullable().optional(),
});
export type StateFundSnapshotDto = z.infer<typeof StateFundSnapshotDtoSchema>;

export const SupportCompaniesFromStateFundRequestSchema = z.object({
  /** 'all' = all active/ipo companies, 'selected' = chỉ định theo mã chứng khoán (tickers) */
  scope: z.enum(['all', 'selected']).default('selected'),
  /** Mã chứng khoán của công ty được chỉ định (vd: VCB, FPT). */
  tickers: z.array(z.string().trim().min(1).max(16)).max(200).optional(),
  /** Giữ tương thích: chỉ định theo ID công ty (UUID). */
  companyIds: z.array(IdSchema).max(200).optional(),
  /** Amount (VND) per company to transfer from state fund */
  amountPerCompanyMinor: z.number().int().positive().max(10_000_000_000),
  reason: z.string().min(3).max(500),
});
export type SupportCompaniesFromStateFundRequest = z.infer<typeof SupportCompaniesFromStateFundRequestSchema>;

export const SupportCompaniesFromStateFundResponseSchema = z.object({
  ok: z.literal(true),
  supportedCompanies: z.number().int().nonnegative(),
  amountPerCompanyMinor: z.number().int().nonnegative(),
  totalSpentMinor: z.number().int().nonnegative(),
  boostedTickers: z.number().int().nonnegative(),
  balanceAfter: MoneySchema,
  tickers: z.array(z.string()).optional(),
});
export type SupportCompaniesFromStateFundResponse = z.infer<typeof SupportCompaniesFromStateFundResponseSchema>;

export const MacroEventTypeSchema = z.enum([
  'banking_crisis',
  'pandemic',
  'crime_sweep',
  'market_boom',
  'market_crash',
]);
export type MacroEventType = z.infer<typeof MacroEventTypeSchema>;

export const TriggerMacroEventRequestSchema = z.object({
  type: MacroEventTypeSchema,
  severity: z.number().min(0).max(1),
  durationInGameYears: z.number().int().min(1).max(20),
  reason: z.string().max(500),
});
export type TriggerMacroEventRequest = z.infer<typeof TriggerMacroEventRequestSchema>;

export const AdminPlayerActionRequestSchema = z.object({
  action: z.enum(['fine', 'ban', 'unban', 'restrict', 'grant_aid', 'force_delete', 'set_death_age']),
  characterId: IdSchema,
  amount: MoneySchema.optional(),
  /** Tuổi thọ tối đa của nhân vật (khi đạt tuổi này sẽ chết). Dùng với action set_death_age; null/omitted = xóa cấu hình. */
  deathAge: z.number().int().min(1).max(200).nullable().optional(),
  note: z.string().max(500).optional(),
});
export type AdminPlayerActionRequest = z.infer<typeof AdminPlayerActionRequestSchema>;

export const CreateAdminAccountRequestSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(80),
  role: z.enum(['admin', 'moderator']),
});
export type CreateAdminAccountRequest = z.infer<typeof CreateAdminAccountRequestSchema>;

export const SetUserRoleRequestSchema = z.object({
  userId: IdSchema,
  role: z.enum(['player', 'moderator', 'admin']),
  note: z.string().max(500).optional(),
});
export type SetUserRoleRequest = z.infer<typeof SetUserRoleRequestSchema>;

export const BroadcastTypeSchema = z.enum(['urgent', 'maintenance', 'event', 'economy', 'news']);
export type BroadcastType = z.infer<typeof BroadcastTypeSchema>;

export const BroadcastScopeSchema = z.enum(['all', 'workers', 'investors', 'businesses']);
export type BroadcastScope = z.infer<typeof BroadcastScopeSchema>;

export const SystemBroadcastDtoSchema = z.object({
  id: IdSchema,
  title: z.string(),
  content: z.string(),
  type: BroadcastTypeSchema,
  scope: BroadcastScopeSchema,
  pinned: z.boolean(),
  sender: z.string(),
  /** Hiển thị tại trang đăng nhập/trang chủ (trước khi vào game) */
  showOnLogin: z.boolean().default(false),
  /** Hiển thị trong ứng dụng/trang người dùng (sau khi đăng nhập) */
  showInApp: z.boolean().default(true),
  createdAt: z.string().datetime(),
});
export type SystemBroadcastDto = z.infer<typeof SystemBroadcastDtoSchema>;

export const CreateSystemBroadcastRequestSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  type: BroadcastTypeSchema.default('news'),
  scope: BroadcastScopeSchema.default('all'),
  pinned: z.boolean().default(false),
  showOnLogin: z.boolean().default(false),
  showInApp: z.boolean().default(true),
});
export type CreateSystemBroadcastRequest = z.infer<typeof CreateSystemBroadcastRequestSchema>;

export const AdminAuditLogDtoSchema = z.object({
  id: IdSchema,
  actorId: IdSchema.nullable(),
  action: z.string(),
  detail: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});
export type AdminAuditLogDto = z.infer<typeof AdminAuditLogDtoSchema>;

export const AdminPlayerSummaryDtoSchema = z.object({
  id: IdSchema,
  userId: IdSchema.nullable(),
  fullName: z.string(),
  cccd: z.string().nullable().optional(),
  isAlive: z.boolean(),
  cash: MoneySchema,
  creditScore: z.number().int(),
  heatLevel: z.number().int(),
  age: z.number().int(),
  deathAge: z.number().int().nullable().optional(),
  role: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
});
export type AdminPlayerSummaryDto = z.infer<typeof AdminPlayerSummaryDtoSchema>;

export const GameConfigDtoSchema = z.object({
  season: z.enum(['spring', 'summer', 'autumn', 'winter']),
  currentDay: z.number().int(),
  currentYear: z.number().int(),
});
export type GameConfigDto = z.infer<typeof GameConfigDtoSchema>;

export const RestrictionContactConfigSchema = z.object({
  enabled: z.boolean().default(true),
  title: z.string().max(200).default('Tài khoản đang bị hạn chế'),
  message: z.string().max(2000).default('Tài khoản của bạn đang bị hạn chế thao tác. Vui lòng liên hệ quản trị viên để được hỗ trợ gỡ hạn chế.'),
  email: z.string().max(200).default(''),
  phone: z.string().max(100).default(''),
  zalo: z.string().max(200).default(''),
  discord: z.string().max(200).default(''),
  other: z.string().max(500).default(''),
  updatedAt: z.string().datetime().optional(),
});
export type RestrictionContactConfig = z.infer<typeof RestrictionContactConfigSchema>;

export const SeasonRangeConfigSchema = z.object({
  season: z.enum(['spring', 'summer', 'autumn', 'winter']),
  startMonth: z.number().int().min(1).max(12),
  endMonth: z.number().int().min(1).max(12),
});
export type SeasonRangeConfig = z.infer<typeof SeasonRangeConfigSchema>;

export const SeasonRangesConfigSchema = z.array(SeasonRangeConfigSchema).length(4);
export type SeasonRangesConfig = z.infer<typeof SeasonRangesConfigSchema>;

export const SeasonEffectConfigSchema = z.object({
  productivityPct: z.number().int().min(0).max(300),
  energyPct: z.number().int().min(0).max(300),
  taxPct: z.number().int().min(0).max(300),
  revenuePct: z.number().int().min(0).max(300),
});
export type SeasonEffectConfig = z.infer<typeof SeasonEffectConfigSchema>;

export const SeasonEffectsConfigSchema = z.object({
  spring: SeasonEffectConfigSchema,
  summer: SeasonEffectConfigSchema,
  autumn: SeasonEffectConfigSchema,
  winter: SeasonEffectConfigSchema,
});
export type SeasonEffectsConfig = z.infer<typeof SeasonEffectsConfigSchema>;

export const UpdateGameConfigRequestSchema = z.object({
  currentDay: z.number().int().min(0).optional(),
  currentYear: z.number().int().min(1).optional(),
  otRatePercent: z.number().int().min(100).max(500).optional(),
  seasonRanges: SeasonRangesConfigSchema.optional(),
  seasonEffects: SeasonEffectsConfigSchema.optional(),
  restrictionContact: RestrictionContactConfigSchema.partial().optional(),
});
export type UpdateGameConfigRequest = z.infer<typeof UpdateGameConfigRequestSchema>;

export const AdminTriggerSweepRequestSchema = z
  .object({
    scope: z.enum(['all', 'character']).optional(),
    characterId: IdSchema.optional(),
    cccd: z.string().trim().optional(),
    note: z.string().max(500).optional(),
  })
  .refine(
    (v) => v.scope === 'all' || !!v.characterId || !!v.cccd || v.scope === 'character',
    { message: 'Cần scope="all" hoặc characterId/cccd để chỉ định mục tiêu.' },
  )
  .refine((v) => v.scope !== 'character' || !!v.characterId || !!v.cccd, {
    message: 'Khi scope="character" cần cung cấp characterId hoặc cccd.',
  });
export type AdminTriggerSweepRequest = z.infer<typeof AdminTriggerSweepRequestSchema>;

export const SavingsRateTermConfigSchema = z.object({
  termMonths: z.number().int().min(0).max(360),
  annualRatePct: z.number().min(0).max(100),
  earlyWithdrawPenaltyPct: z.number().min(0).max(100).default(0),
  label: z.string().trim().min(1).max(100),
});
export type SavingsRateTermConfig = z.infer<typeof SavingsRateTermConfigSchema>;

export const AccountTierThresholdsSchema = z.object({
  standard: z.number().int().min(0).default(0),
  silver: z.number().int().min(0).default(50_000_000),
  gold: z.number().int().min(0).default(200_000_000),
  platinum: z.number().int().min(0).default(1_000_000_000),
  diamond: z.number().int().min(0).default(5_000_000_000),
});
export type AccountTierThresholds = z.infer<typeof AccountTierThresholdsSchema>;

export const InterestRateConfigDtoSchema = z.object({
  loanBaseRatePct: z.number().min(0).max(100),
  savingsTerms: z.array(SavingsRateTermConfigSchema),
  accountTierThresholds: AccountTierThresholdsSchema,
});
export type InterestRateConfigDto = z.infer<typeof InterestRateConfigDtoSchema>;

export const UpdateInterestRateConfigRequestSchema = z.object({
  loanBaseRatePct: z.number().min(0).max(100),
  savingsTerms: z.array(SavingsRateTermConfigSchema).min(1),
  accountTierThresholds: AccountTierThresholdsSchema.optional(),
});
export type UpdateInterestRateConfigRequest = z.infer<typeof UpdateInterestRateConfigRequestSchema>;

// --- Company industry revenue config (30 game days auto revenue) ---
export const IndustryRevenueConfigDtoSchema = z.object({
  industryType: z.string(),
  monthlyRatePct: z.number().nonnegative(),
  minRevenueMinor: z.number().int().nonnegative(),
  maxRevenueMinor: z.number().int().nonnegative(),
  updatedAt: z.string().datetime().nullable().optional(),
  updatedBy: IdSchema.nullable().optional(),
});
export type IndustryRevenueConfigDto = z.infer<typeof IndustryRevenueConfigDtoSchema>;

export const UpsertIndustryRevenueConfigsRequestSchema = z.object({
  configs: z.array(z.object({
    industryType: z.string().min(1),
    monthlyRatePct: z.number().nonnegative().max(1000),
    minRevenueMinor: z.number().int().nonnegative(),
    maxRevenueMinor: z.number().int().nonnegative(),
  })).min(1),
});
export type UpsertIndustryRevenueConfigsRequest = z.infer<typeof UpsertIndustryRevenueConfigsRequestSchema>;

// --- Admin stock market price control ---
export const AdminStockAdjustRequestSchema = z.object({
  mode: z.enum(['INSTANT_SHOCK', 'TREND_BIAS']),
  deltaPct: z.number().min(-50).max(50),
  scope: z.enum(['ALL_MARKET', 'SPECIFIC_COMPANIES']),
  companyIds: z.array(IdSchema).optional().default([]),
  durationHours: z.number().int().min(1).max(24 * 365).optional(),
  reason: z.string().min(1).max(500),
}).superRefine((v, ctx) => {
  if (v.scope === 'SPECIFIC_COMPANIES' && (!v.companyIds || v.companyIds.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cần chọn ít nhất một công ty khi phạm vi là SPECIFIC_COMPANIES.' });
  }
  if (v.mode === 'TREND_BIAS' && (!v.durationHours || v.durationHours <= 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'TREND_BIAS yêu cầu duration_hours > 0.' });
  }
});
export type AdminStockAdjustRequest = z.infer<typeof AdminStockAdjustRequestSchema>;

export const AdminMarketLogDtoSchema = z.object({
  id: IdSchema,
  adminId: IdSchema.nullable(),
  scope: z.enum(['ALL_MARKET', 'SPECIFIC_COMPANIES']),
  targetIds: z.array(z.string()),
  mode: z.enum(['INSTANT_SHOCK', 'TREND_BIAS']),
  deltaPct: z.number(),
  durationHours: z.number().int().nullable(),
  reason: z.string(),
  createdAt: z.string().datetime(),
});
export type AdminMarketLogDto = z.infer<typeof AdminMarketLogDtoSchema>;
