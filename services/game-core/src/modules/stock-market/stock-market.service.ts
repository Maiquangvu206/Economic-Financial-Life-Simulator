import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID } from '../../shared/ledger/ledger.service.js';
import {
  type TickerDto,
  type OrderDto,
  type HoldingDto,
  type PortfolioDto,
  type TradeDto,
  MoneySchema,
} from '@efls/contracts';
import { stockMarketRepository } from './stock-market.repository.js';
import type { PoolClient } from 'pg';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function toTickerDto(
  row: Awaited<ReturnType<typeof stockMarketRepository.listTickers>>[number],
): TickerDto {
  return {
    id: row.id,
    companyId: row.companyId,
    symbol: row.symbol,
    companyName: row.companyName,
    currentPrice: money(Number(row.currentPriceMinor)),
    change24hPct: Number(row.change24hPct),
    totalVolume: row.totalVolume,
    isIpo: row.isIpo,
  };
}

function toOrderDto(
  row: Awaited<ReturnType<typeof stockMarketRepository.listOrdersByCharacter>>[number],
): OrderDto {
  return {
    id: row.id,
    tickerId: row.tickerId,
    symbol: row.symbol,
    characterId: row.characterId,
    side: row.side as OrderDto['side'],
    price: money(Number(row.priceMinor)),
    amount: row.amount,
    filledAmount: row.filledAmount,
    status: row.status as OrderDto['status'],
    createdAt: row.createdAt.toISOString(),
  };
}

function toHoldingDto(
  row: Awaited<ReturnType<typeof stockMarketRepository.listHoldings>>[number],
): HoldingDto {
  const marketValue = row.shares * Number(row.currentPriceMinor);
  return {
    tickerId: row.tickerId,
    symbol: row.symbol,
    companyName: row.companyName,
    shares: row.shares,
    averageCost: money(Number(row.averageCostMinor ?? 0)),
    marketValue: money(marketValue),
    unrealizedPnl: money(marketValue - row.shares * Number(row.averageCostMinor ?? 0)),
  };
}

function toTradeDto(
  row: Awaited<ReturnType<typeof stockMarketRepository.listTrades>>[number],
): TradeDto {
  return {
    id: row.id,
    tickerId: row.tickerId,
    price: money(Number(row.priceMinor)),
    amount: row.amount,
    executedAt: row.executedAt.toISOString(),
  };
}

/** Dịch vụ chứng khoán: xem giá, đặt lệnh, danh mục, lịch sử giao dịch. */
export class StockMarketService {
  constructor(private readonly repository = stockMarketRepository) {}

  async getTickers() {
    const rows = await this.repository.listTickers();
    return rows.map(toTickerDto);
  }

  async getOrders(userId: string) {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const rows = await this.repository.listOrdersByCharacter(character.id);
    return rows.map(toOrderDto);
  }

  /** Đặt lệnh mua/bán và khớp lệnh theo giá–thời ưu tiên. */
  async placeOrder(
    userId: string,
    tickerId: string,
    side: 'buy' | 'sell',
    priceMinor: number,
    amount: number,
  ): Promise<{ orderId: string; filledAmount: number; trades: TradeDto[]; status: string }> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);

      const trades: TradeDto[] = [];
      let remainingAmount = amount;

      if (side === 'buy') {
        const cost = priceMinor * amount;
        const cash = toMinor(character.cash_minor);
        if (cash < cost) {
          throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để đặt lệnh mua.');
        }
        // Escrow toàn bộ chi phí mua.
        await ledger.transfer(client, {
          from: { ownerType: 'character', ownerId: character.id },
          to: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          amountMinor: cost,
          kind: 'order_escrow',
          description: `Escrow lệnh mua ${tickerId}`,
          referenceType: 'order',
          referenceId: undefined,
        });

        // Khớp với lệnh bán thấp nhất trước (asks).
        const asks = await this.repository.getOrderBook(tickerId);
        for (const ask of asks.asks) {
          if (remainingAmount <= 0) break;
          if (ask.priceMinor > priceMinor) break; // giá bán cao hơn giá mua, dừng khớp
          const matchAmount = Math.min(remainingAmount, ask.amount);
          const tradePrice = ask.priceMinor;

          // Tìm chủ lệnh bán để chuyển tiền.
          const askOrder = await this.repository.getBestAskOrder(tickerId, tradePrice);
          if (!askOrder) continue;

          await this.executeTrade(
            client,
            character.id,
            askOrder.characterId,
            tickerId,
            tradePrice,
            matchAmount,
          );

          trades.push({
            id: crypto.randomUUID(),
            tickerId,
            price: money(tradePrice),
            amount: matchAmount,
            executedAt: new Date().toISOString(),
          });
          remainingAmount -= matchAmount;

          await this.repository.updateOrderFilled(
            askOrder.id,
            askOrder.filledAmount + matchAmount,
            askOrder.filledAmount + matchAmount >= askOrder.amount ? 'filled' : 'partially_filled',
          );
        }
      } else {
        // Lệnh bán: kiểm tra cổ phiếu sở hữu.
        const holdings = await this.repository.listHoldings(character.id);
        const holding = holdings.find((h) => h.tickerId === tickerId);
        const ownedShares = holding?.shares ?? 0;
        if (ownedShares < amount) {
          throw AppError.conflict('insufficient_shares', 'Không đủ cổ phiếu để đặt lệnh bán.');
        }

        // Khớp với lệnh mua cao nhất trước (bids).
        const bids = await this.repository.getOrderBook(tickerId);
        for (const bid of bids.bids) {
          if (remainingAmount <= 0) break;
          if (bid.priceMinor < priceMinor) break; // giá mua thấp hơn giá bán, dừng khớp
          const matchAmount = Math.min(remainingAmount, bid.amount);
          const tradePrice = bid.priceMinor;

          const bidOrder = await this.repository.getBestBidOrder(tickerId, tradePrice);
          if (!bidOrder) continue;

          await this.executeTrade(
            client,
            bidOrder.characterId,
            character.id,
            tickerId,
            tradePrice,
            matchAmount,
          );

          trades.push({
            id: crypto.randomUUID(),
            tickerId,
            price: money(tradePrice),
            amount: matchAmount,
            executedAt: new Date().toISOString(),
          });
          remainingAmount -= matchAmount;

          await this.repository.updateOrderFilled(
            bidOrder.id,
            bidOrder.filledAmount + matchAmount,
            bidOrder.filledAmount + matchAmount >= bidOrder.amount ? 'filled' : 'partially_filled',
          );
        }
      }

      const orderStatus = remainingAmount <= 0 ? 'filled' : 'open';
      const orderId = await this.repository.createOrder(client, {
        characterId: character.id,
        tickerId,
        side,
        priceMinor,
        amount: remainingAmount > 0 ? remainingAmount : amount,
      });

      // Nếu lệnh còn lại (open), tạo lệnh mới với số lượng còn lại.
      // Nếu đã khớp hết, lệnh đã được tạo trong executeTrade hoặc ở đây.
      // Đơn giản hóa: tạo một lệnh với filledAmount đã xử lý qua trades.
      // Ở đây chúng ta tạo lại lệnh cho phần còn lại nếu có.
      if (remainingAmount > 0 && side === 'buy') {
        // Giải phóng escrow phần chưa khớp (đã escrow toàn bộ, trả lại phần dư).
        const unmatchedCost = priceMinor * remainingAmount;
        await ledger.transfer(client, {
          from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          to: { ownerType: 'character', ownerId: character.id },
          amountMinor: unmatchedCost,
          kind: 'order_escrow_refund',
          description: `Hoàn escrow phần chưa khớp ${orderId}`,
          referenceType: 'order',
          referenceId: orderId,
        });
      }

      return {
        orderId,
        filledAmount: amount - remainingAmount,
        trades,
        status: orderStatus,
      };
    });
  }

  /** Thực hiện một giao dịch: chuyển tiền và cổ phiếu giữa người mua và người bán. */
  private async executeTrade(
    client: PoolClient,
    buyerId: string,
    sellerId: string,
    tickerId: string,
    priceMinor: number,
    amount: number,
  ): Promise<void> {
    const total = priceMinor * amount;
    // Chuyển tiền từ escrow (người mua đã escrow) đến người bán.
    await ledger.transfer(client, {
      from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
      to: { ownerType: 'character', ownerId: sellerId },
      amountMinor: total,
      kind: 'trade_settlement',
      description: `Khớp lệnh ${tickerId}`,
      referenceType: 'trade',
      referenceId: undefined,
    });
    // Chuyển cổ phiếu từ người bán đến người mua.
    await this.repository.updateHolding(sellerId, tickerId, -amount);
    await this.repository.updateHolding(buyerId, tickerId, amount);
    await this.repository.createTrade(tickerId, buyerId, sellerId, priceMinor, amount);
  }

  async cancelOrder(userId: string, orderId: string) {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const order = await this.repository.getOrderById(orderId);
      if (!order) throw AppError.notFound('Order');
      if (order.characterId !== character.id) {
        throw AppError.forbidden('Chỉ người đặt lệnh mới được hủy.');
      }
      if (order.status !== 'open') {
        throw AppError.badRequest('Chỉ có thể hủy lệnh đang mở.');
      }

      if (order.side === 'buy') {
        await ledger.transfer(client, {
          from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          to: { ownerType: 'character', ownerId: character.id },
          amountMinor: Number(order.priceMinor) * order.amount,
          kind: 'order_escrow_refund',
          description: `Hoàn escrow lệnh ${orderId}`,
          referenceType: 'order',
          referenceId: orderId,
        });
      }

      await this.repository.cancelOrder(client, orderId, character.id);
    });
  }

  async getPortfolio(userId: string): Promise<PortfolioDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const [holdings, orders] = await Promise.all([
      this.repository.listHoldings(character.id),
      this.repository.listOrdersByCharacter(character.id),
    ]);
    const holdingDtos = holdings.map(toHoldingDto);
    const totalMarketValue = holdingDtos.reduce((sum, h) => sum + h.marketValue.amount, 0);
    const totalUnrealizedPnl = holdingDtos.reduce((sum, h) => sum + h.unrealizedPnl.amount, 0);

    return {
      holdings: holdingDtos,
      openOrders: orders.map(toOrderDto),
      totalMarketValue: money(totalMarketValue),
      totalUnrealizedPnl: money(totalUnrealizedPnl),
    };
  }

  async getTrades(userId: string): Promise<TradeDto[]> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const rows = await this.repository.listTrades(character.id);
    return rows.map(toTradeDto);
  }

  async getOrderBook(tickerId: string) {
    return this.repository.getOrderBook(tickerId);
  }

  async getMarketSnapshot() {
    const rows = await this.repository.listTickers();
    const tickers = rows.map(toTickerDto);
    const totalMarketCap = tickers.reduce((sum, t) => sum + t.currentPrice.amount, 0);
    const totalVolume24h = tickers.reduce((sum, t) => sum + t.totalVolume, 0);
    return {
      tickers,
      totalMarketCap: money(totalMarketCap),
      totalVolume24h,
      updatedAt: new Date().toISOString(),
    };
  }
}

export const stockMarketService = new StockMarketService();
