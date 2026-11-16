import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { OrderSideSchema, OrderStatusSchema } from '../enums/index.js';

export const TickerDtoSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  symbol: z.string().min(1).max(8),
  companyName: z.string(),
  currentPrice: MoneySchema,
  change24hPct: z.number(),
  totalVolume: z.number().int().nonnegative(),
  isIpo: z.boolean(),
});
export type TickerDto = z.infer<typeof TickerDtoSchema>;

export const PlaceOrderRequestSchema = z.object({
  tickerId: IdSchema,
  side: OrderSideSchema,
  /** Số lượng cổ phiếu. Giá khớp = giá thị trường hiện tại tại thời điểm thực hiện (mua/bán ngay). */
  amount: z.number().int().positive(),
});
export type PlaceOrderRequest = z.infer<typeof PlaceOrderRequestSchema>;

export const OrderDtoSchema = z.object({
  id: IdSchema,
  tickerId: IdSchema,
  symbol: z.string(),
  characterId: IdSchema,
  side: OrderSideSchema,
  price: MoneySchema,
  amount: z.number().int().positive(),
  filledAmount: z.number().int().nonnegative(),
  status: OrderStatusSchema,
  createdAt: z.string().datetime(),
});
export type OrderDto = z.infer<typeof OrderDtoSchema>;

export const OrderBookSnapshotSchema = z.object({
  tickerId: IdSchema,
  bids: z.array(z.object({ price: MoneySchema, amount: z.number().int() })),
  asks: z.array(z.object({ price: MoneySchema, amount: z.number().int() })),
  lastPrice: MoneySchema.nullable(),
  updatedAt: z.string().datetime(),
});
export type OrderBookSnapshot = z.infer<typeof OrderBookSnapshotSchema>;

export const HoldingDtoSchema = z.object({
  tickerId: IdSchema,
  symbol: z.string(),
  companyName: z.string(),
  shares: z.number().int().nonnegative(),
  averageCost: MoneySchema,
  marketValue: MoneySchema,
  unrealizedPnl: MoneySchema,
});
export type HoldingDto = z.infer<typeof HoldingDtoSchema>;

export const PortfolioDtoSchema = z.object({
  holdings: z.array(HoldingDtoSchema),
  /** Không còn lệnh mở (mua/bán khớp ngay). Giữ để tương thích, luôn rỗng. */
  openOrders: z.array(OrderDtoSchema),
  totalMarketValue: MoneySchema,
  totalUnrealizedPnl: MoneySchema,
});
export type PortfolioDto = z.infer<typeof PortfolioDtoSchema>;

export const TradeDtoSchema = z.object({
  id: IdSchema,
  tickerId: IdSchema,
  symbol: z.string(),
  side: OrderSideSchema,
  price: MoneySchema,
  amount: z.number().int().positive(),
  executedAt: z.string().datetime(),
});
export type TradeDto = z.infer<typeof TradeDtoSchema>;

export const MarketSnapshotDtoSchema = z.object({
  tickers: z.array(TickerDtoSchema),
  totalMarketCap: MoneySchema,
  totalVolume24h: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});
export type MarketSnapshotDto = z.infer<typeof MarketSnapshotDtoSchema>;

export const PlaceOrderResponseSchema = z.object({
  ok: z.literal(true),
  side: OrderSideSchema,
  tickerId: IdSchema,
  symbol: z.string(),
  amount: z.number().int().positive(),
  executedPrice: MoneySchema,
  total: MoneySchema,
  trades: z.array(TradeDtoSchema),
  message: z.string(),
});
export type PlaceOrderResponse = z.infer<typeof PlaceOrderResponseSchema>;

// Legacy alias
export const MatchResultSchema = PlaceOrderResponseSchema;
export type MatchResult = z.infer<typeof MatchResultSchema>;

export const TakeoverRequestSchema = z
  .object({
    companyId: IdSchema.optional(),
    buyerCccd: z.string().optional(),
    buyerCharacterId: IdSchema.optional(),
  })
  .refine((v) => !!v.buyerCccd || !!v.buyerCharacterId, { message: 'Cần buyerCccd hoặc buyerCharacterId.' });
export type TakeoverRequest = z.infer<typeof TakeoverRequestSchema>;
