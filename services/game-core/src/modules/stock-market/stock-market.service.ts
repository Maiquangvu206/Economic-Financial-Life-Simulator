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

  /** Đặt lệnh mua/bán. Tiền mua được giữ trong escrow cho đến khi khớp/hủy. */
  async placeOrder(
    userId: string,
    tickerId: string,
    side: 'buy' | 'sell',
    priceMinor: number,
    amount: number,
  ) {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      if (side === 'buy') {
        const cost = priceMinor * amount;
        const cash = toMinor(character.cash_minor);
        if (cash < cost) {
          throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để đặt lệnh mua.');
        }
        await ledger.transfer(client, {
          from: { ownerType: 'character', ownerId: character.id },
          to: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          amountMinor: cost,
          kind: 'order_escrow',
          description: `Escrow lệnh mua ${tickerId}`,
          referenceType: 'order',
          referenceId: undefined,
        });
      }

      const orderId = await this.repository.createOrder(client, {
        characterId: character.id,
        tickerId,
        side,
        priceMinor,
        amount,
      });

      const tickerRow = await client.query<{ symbol: string }>(
        `SELECT symbol FROM stock_tickers WHERE id = $1`,
        [tickerId],
      );
      return {
        id: orderId,
        tickerId,
        symbol: tickerRow.rows[0]?.symbol ?? '',
        characterId: character.id,
        side,
        price: money(priceMinor),
        amount,
        filledAmount: 0,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
    });
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
}

export const stockMarketService = new StockMarketService();
