import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const AuctionStatusSchema = z.enum(['open', 'ended', 'cancelled']);
export type AuctionStatus = z.infer<typeof AuctionStatusSchema>;

export const AuctionDtoSchema = z.object({
  id: IdSchema,
  /** Null for province/system land auctions. */
  propertyId: IdSchema.nullable(),
  propertyName: z.string(),
  /** Seller character id (null for system/GM auctions). */
  sellerCharacterId: IdSchema.nullable(),
  sellerName: z.string(),
  startingPrice: MoneySchema,
  currentBid: MoneySchema,
  highestBidderId: IdSchema.nullable(),
  highestBidderName: z.string().nullable(),
  endsAt: z.string().datetime(),
  status: AuctionStatusSchema,
  createdAt: z.string().datetime(),
  /** Người xem hiện tại là người bán hay không. */
  isMine: z.boolean(),
  /** Người xem hiện tại là người giữ giá cao nhất hay không. */
  isHighestBidder: z.boolean(),
  /** Province land auction (per-map). When present, this is a GM land auction for a specific tile. */
  provinceCode: z.string().optional(),
  location: z
    .object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() })
    .optional(),
  zoneType: z.string().optional(),
  source: z.enum(['property', 'province_land']).optional(),
});
export type AuctionDto = z.infer<typeof AuctionDtoSchema>;

export const AuctionOverviewDtoSchema = z.object({
  auctions: z.array(AuctionDtoSchema),
  openCount: z.number().int().nonnegative(),
  /** Province context when requested. */
  provinceCode: z.string().optional(),
});
export type AuctionOverviewDto = z.infer<typeof AuctionOverviewDtoSchema>;

export const PlaceBidRequestSchema = z.object({
  auctionId: IdSchema,
  amount: MoneySchema,
});
export type PlaceBidRequest = z.infer<typeof PlaceBidRequestSchema>;

export const CreateAuctionRequestSchema = z.object({
  propertyId: IdSchema,
  startingPrice: MoneySchema,
  endsAt: z.string().datetime(),
});
export type CreateAuctionRequest = z.infer<typeof CreateAuctionRequestSchema>;

export const CancelAuctionRequestSchema = z.object({
  auctionId: IdSchema,
});
export type CancelAuctionRequest = z.infer<typeof CancelAuctionRequestSchema>;
