import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { ZoneTypeSchema } from '../enums/index.js';

export const PropertyTypeSchema = z.enum([
  'apartment',
  'house',
  'office',
  'warehouse',
  'port_berth',
  /** Đất nền mua trực tiếp trên ô đất trống (giá do admin đặt). */
  'land',
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const PropertyStatusSchema = z.enum(['unowned', 'owned', 'listed', 'auction']);
export type PropertyStatus = z.infer<typeof PropertyStatusSchema>;

export const PropertySaleOfferStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
]);
export type PropertySaleOfferStatus = z.infer<typeof PropertySaleOfferStatusSchema>;

export const PropertySaleOfferDtoSchema = z.object({
  id: IdSchema,
  propertyId: IdSchema,
  buyerCharacterId: IdSchema,
  buyerName: z.string().nullable().optional(),
  sellerCharacterId: IdSchema,
  amount: MoneySchema,
  status: PropertySaleOfferStatusSchema,
  message: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  isMine: z.boolean().optional(),
});
export type PropertySaleOfferDto = z.infer<typeof PropertySaleOfferDtoSchema>;

export const ActiveLeaseInfoDtoSchema = z.object({
  tenantCharacterId: IdSchema,
  tenantName: z.string().nullable().optional(),
  monthlyRent: MoneySchema,
  startedAt: z.string().datetime(),
  nextDueAt: z.string().datetime(),
});
export type ActiveLeaseInfoDto = z.infer<typeof ActiveLeaseInfoDtoSchema>;

export const PropertyDtoSchema = z.object({
  id: IdSchema,
  nodeId: IdSchema,
  name: z.string(),
  /** Số lô/thửa (nếu có). */
  lotNumber: z.string().nullable(),
  /** Tỉnh/thành phố. */
  province: z.string().nullable(),
  location: z.object({ x: z.number().int(), y: z.number().int() }),
  zoneType: ZoneTypeSchema,
  propertyType: PropertyTypeSchema,
  purchasePrice: MoneySchema,
  currentValue: MoneySchema,
  /** Giá thuê niêm yết/tháng (bảng giá cho thuê). */
  monthlyRent: MoneySchema,
  rentListingActive: z.boolean(),
  rentDeposit: MoneySchema,
  rentNotes: z.string().nullable(),
  /** Giá bán niêm yết (nếu đang bán). */
  askingPrice: MoneySchema.nullable(),
  saleNotes: z.string().nullable(),
  status: PropertyStatusSchema,
  ownerCharacterId: IdSchema.nullable(),
  ownerCompanyId: IdSchema.nullable(),
  isMine: z.boolean(),
  leasedByMe: z.boolean(),
  /** Hợp đồng thuê đang hoạt động (nếu có). */
  activeLease: ActiveLeaseInfoDtoSchema.nullable().optional(),
  /** Đề nghị mua/trao đổi giá (cho chủ sở hữu hoặc người mua liên quan). */
  offers: z.array(PropertySaleOfferDtoSchema).optional(),
});
export type PropertyDto = z.infer<typeof PropertyDtoSchema>;

export const RealEstateOverviewDtoSchema = z.object({
  properties: z.array(PropertyDtoSchema),
  ownedCount: z.number().int(),
  portfolioValue: MoneySchema,
  monthlyRentIncome: MoneySchema,
});
export type RealEstateOverviewDto = z.infer<typeof RealEstateOverviewDtoSchema>;

export const BuyPropertyRequestSchema = z.object({ propertyId: IdSchema });
export type BuyPropertyRequest = z.infer<typeof BuyPropertyRequestSchema>;

/** POST /api/v1/real-estate/buy-land — mua đất nền trên ô đất trống (theo tọa độ bản đồ Hà Nội). */
export const BuyLandRequestSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});
export type BuyLandRequest = z.infer<typeof BuyLandRequestSchema>;

export const ListPropertyRequestSchema = z.object({
  propertyId: IdSchema,
  askingPrice: MoneySchema,
  saleNotes: z.string().max(500).optional(),
});
export type ListPropertyRequest = z.infer<typeof ListPropertyRequestSchema>;

/** Cập nhật bảng giá/điều khoản cho thuê (chủ sở hữu). */
export const UpdateRentTermsRequestSchema = z.object({
  propertyId: IdSchema,
  monthlyRentMinor: z.number().int().nonnegative(),
  rentDepositMinor: z.number().int().nonnegative().default(0),
  rentListingActive: z.boolean(),
  rentNotes: z.string().max(500).optional().nullable(),
});
export type UpdateRentTermsRequest = z.infer<typeof UpdateRentTermsRequestSchema>;

/** Thuê BĐS theo bảng giá niêm yết. */
export const RentPropertyRequestSchema = z.object({
  propertyId: IdSchema,
});
export type RentPropertyRequest = z.infer<typeof RentPropertyRequestSchema>;

/** Gửi đề nghị mua/trao đổi giá. */
export const MakePropertyOfferRequestSchema = z.object({
  propertyId: IdSchema,
  amount: MoneySchema,
  message: z.string().max(500).optional(),
});
export type MakePropertyOfferRequest = z.infer<typeof MakePropertyOfferRequestSchema>;

export const RespondPropertyOfferRequestSchema = z.object({
  offerId: IdSchema,
  action: z.enum(['accept', 'reject', 'cancel']),
});
export type RespondPropertyOfferRequest = z.infer<typeof RespondPropertyOfferRequestSchema>;
