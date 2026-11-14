import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { type TickerDto, type OrderDto, type HoldingDto, type PortfolioDto, type TradeDto, MoneySchema } from '@efls/contracts';
import { stockMarketRepository } from './stock-market.repository.js';
import type { PoolClient } from 'pg';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function toTickerDto(row: Awaited<ReturnType<typeof stockMarketRepository.listTickers>>[number]): TickerDto {
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

function toOrderDto(row: Awaited<ReturnType<typeof stockMarketRepository.listOrdersByCharacter>>[number]): OrderDto {
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

function toHoldingDto(row: Awaited<ReturnType<typeof stockMarketRepository.listHoldings>>[number]): HoldingDto {
  const current = Number(row.currentPriceMinor);
  const avg = Number(row.averageCostMinor ?? current);
  const marketValue = row.shares * current;
  const costBasis = row.shares * avg;
  return {
    tickerId: row.tickerId,
    symbol: row.symbol,
    companyName: row.companyName,
    shares: row.shares,
    averageCost: money(avg),
    marketValue: money(marketValue),
    unrealizedPnl: money(marketValue - costBasis),
  };
}

function toTradeDto(row: Awaited<ReturnType<typeof stockMarketRepository.listTrades>>[number]): TradeDto {
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

  async placeOrder(
    userId: string,
    tickerId: string,
    side: 'buy' | 'sell',
    priceMinor: number,
    amount: number,
  ): Promise<{ orderId: string | null; filledAmount: number; trades: TradeDto[]; status: string; message: string }> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const ticker = await this.repository.getTickerById(tickerId, client);
      if (!ticker) throw AppError.notFound('Ticker');

      const trades: TradeDto[] = [];
      let remainingAmount = amount;
      let spentMinor = 0;
      let receivedMinor = 0;

      if (side === 'buy') {
        const maxCost = priceMinor * amount;
        const cash = toMinor(character.cash_minor);
        if (cash < maxCost) {
          throw AppError.conflict('insufficient_funds', `Không đủ tiền mặt để mua. Cần ${maxCost.toLocaleString('vi-VN')} ₫, hiện có ${cash.toLocaleString('vi-VN')} ₫.`);
        }

        // Khớp với sổ lệnh bán (asks) nếu có
        const book = await this.repository.getOrderBook(tickerId);
        for (const ask of book.asks) {
          if (remainingAmount <= 0) break;
          if (ask.priceMinor > priceMinor) break;
          const matchAmount = Math.min(remainingAmount, ask.amount);
          const askOrder = await this.repository.getBestAskOrder(tickerId, ask.priceMinor, client);
          if (!askOrder) continue;
          const tradeId = await this.executeTrade(client, character.id, askOrder.characterId, tickerId, ask.priceMinor, matchAmount, undefined, askOrder.id);
          spentMinor += ask.priceMinor * matchAmount;
          trades.push({ id: tradeId, tickerId, price: money(ask.priceMinor), amount: matchAmount, executedAt: new Date().toISOString() });
          remainingAmount -= matchAmount;
          const newFilled = askOrder.filledAmount + matchAmount;
          await this.repository.updateOrderFilled(client, askOrder.id, newFilled, newFilled >= askOrder.amount ? 'filled' : 'partially_filled');
        }

        // Khớp thị trường (market maker) với phần còn lại nếu giá đặt >= giá hiện tại -> cập nhật ngay sau khi mua
        const marketPrice = Number(ticker.currentPriceMinor);
        if (remainingAmount > 0 && priceMinor >= marketPrice) {
          const fillAmount = remainingAmount;
          const total = marketPrice * fillAmount;
          await ledger.transfer(client, {
            from: { ownerType: 'character', ownerId: character.id },
            to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
            amountMinor: total,
            kind: 'stock_buy',
            description: `Mua ${fillAmount} ${ticker.symbol} @ ${marketPrice}`,
            referenceType: 'ticker',
            referenceId: tickerId,
          });
          await this.repository.updateHolding(client, character.id, tickerId, fillAmount, marketPrice);
          const tradeId = await this.repository.createTrade(client, tickerId, character.id, null, marketPrice, fillAmount);
          spentMinor += total;
          trades.push({ id: tradeId, tickerId, price: money(marketPrice), amount: fillAmount, executedAt: new Date().toISOString() });
          remainingAmount = 0;
        }

        // Phần còn lại (giá đặt thấp hơn thị trường, không khớp) -> tạo lệnh mở và giữ tiền trong escrow
        let orderId: string | null = null;
        if (remainingAmount > 0) {
          const escrowAmount = priceMinor * remainingAmount;
          await ledger.transfer(client, {
            from: { ownerType: 'character', ownerId: character.id },
            to: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
            amountMinor: escrowAmount,
            kind: 'order_escrow',
            description: `Escrow lệnh mua ${ticker.symbol} còn lại ${remainingAmount}`,
            referenceType: 'ticker',
            referenceId: tickerId,
          });
          orderId = await this.repository.createOrder(client, {
            characterId: character.id,
            tickerId,
            side,
            priceMinor,
            amount: remainingAmount,
            filledAmount: 0,
            status: 'open',
          });
        }

        const filledAmount = amount - remainingAmount;
        const status = remainingAmount <= 0 ? 'filled' : filledAmount > 0 ? 'partially_filled' : 'open';
        const msg =
          remainingAmount <= 0
            ? `Đã mua ${filledAmount} ${ticker.symbol}, tổng ${spentMinor.toLocaleString('vi-VN')} ₫. Danh mục đã được cập nhật.`
            : filledAmount > 0
              ? `Đã khớp ${filledAmount} ${ticker.symbol} (${spentMinor.toLocaleString('vi-VN')} ₫), còn ${remainingAmount} đang chờ khớp (giữ ${ (priceMinor*remainingAmount).toLocaleString('vi-VN') } ₫).`
              : `Đã đặt lệnh mua ${remainingAmount} ${ticker.symbol} @ ${priceMinor.toLocaleString('vi-VN')} ₫ (chờ khớp, đã giữ tiền trong escrow).`;
        return { orderId, filledAmount, trades, status, message: msg };
      } else {
        // Sell
        const holdings = await this.repository.listHoldings(character.id);
        const holding = holdings.find((h) => h.tickerId === tickerId);
        const ownedShares = holding?.shares ?? 0;
        if (ownedShares < amount) {
          throw AppError.conflict('insufficient_shares', `Không đủ cổ phiếu để bán. Đang sở hữu ${ownedShares}, muốn bán ${amount}.`);
        }

        const book = await this.repository.getOrderBook(tickerId);
        for (const bid of book.bids) {
          if (remainingAmount <= 0) break;
          if (bid.priceMinor < priceMinor) break;
          const matchAmount = Math.min(remainingAmount, bid.amount);
          const bidOrder = await this.repository.getBestBidOrder(tickerId, bid.priceMinor, client);
          if (!bidOrder) continue;
          const tradeId = await this.executeTrade(client, bidOrder.characterId, character.id, tickerId, bid.priceMinor, matchAmount, bidOrder.id, undefined);
          receivedMinor += bid.priceMinor * matchAmount;
          trades.push({ id: tradeId, tickerId, price: money(bid.priceMinor), amount: matchAmount, executedAt: new Date().toISOString() });
          remainingAmount -= matchAmount;
          const newFilled = bidOrder.filledAmount + matchAmount;
          await this.repository.updateOrderFilled(client, bidOrder.id, newFilled, newFilled >= bidOrder.amount ? 'filled' : 'partially_filled');
        }

        const marketPrice = Number(ticker.currentPriceMinor);
        if (remainingAmount > 0 && priceMinor <= marketPrice) {
          const fillAmount = remainingAmount;
          const total = marketPrice * fillAmount;
          await this.repository.updateHolding(client, character.id, tickerId, -fillAmount);
          await ledger.transfer(client, {
            from: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
            to: { ownerType: 'character', ownerId: character.id },
            amountMinor: total,
            kind: 'stock_sell',
            description: `Bán ${fillAmount} ${ticker.symbol} @ ${marketPrice}`,
            referenceType: 'ticker',
            referenceId: tickerId,
          });
          const tradeId = await this.repository.createTrade(client, tickerId, null, character.id, marketPrice, fillAmount);
          receivedMinor += total;
          trades.push({ id: tradeId, tickerId, price: money(marketPrice), amount: fillAmount, executedAt: new Date().toISOString() });
          remainingAmount = 0;
        }

        let orderId: string | null = null;
        if (remainingAmount > 0) {
          orderId = await this.repository.createOrder(client, {
            characterId: character.id,
            tickerId,
            side,
            priceMinor,
            amount: remainingAmount,
            filledAmount: 0,
            status: 'open',
          });
        }

        const filledAmount = amount - remainingAmount;
        const status = remainingAmount <= 0 ? 'filled' : filledAmount > 0 ? 'partially_filled' : 'open';
        const msg =
          remainingAmount <= 0
            ? `Đã bán ${filledAmount} ${ticker.symbol}, thu về ${receivedMinor.toLocaleString('vi-VN')} ₫. Danh mục/số dư đã được cập nhật.`
            : filledAmount > 0
              ? `Đã khớp ${filledAmount} ${ticker.symbol}, còn ${remainingAmount} đang chờ khớp.`
              : `Đã đặt lệnh bán ${remainingAmount} ${ticker.symbol} @ ${priceMinor.toLocaleString('vi-VN')} ₫ (chờ khớp).`;
        return { orderId, filledAmount, trades, status, message: msg };
      }
    });
  }

  private async executeTrade(
    client: PoolClient,
    buyerId: string,
    sellerId: string,
    tickerId: string,
    priceMinor: number,
    amount: number,
    buyOrderId?: string,
    sellOrderId?: string,
  ): Promise<string> {
    const total = priceMinor * amount;
    await ledger.transfer(client, {
      from: { ownerType: 'character', ownerId: buyerId },
      to: { ownerType: 'character', ownerId: sellerId },
      amountMinor: total,
      kind: 'trade_settlement',
      description: `Khớp lệnh ${tickerId}`,
      referenceType: 'trade',
      referenceId: undefined,
    });
    await this.repository.updateHolding(client, sellerId, tickerId, -amount);
    await this.repository.updateHolding(client, buyerId, tickerId, amount, priceMinor);
    return this.repository.createTrade(client, tickerId, buyerId, sellerId, priceMinor, amount, buyOrderId, sellOrderId);
  }

  async cancelOrder(userId: string, orderId: string) {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const order = await this.repository.getOrderById(orderId);
      if (!order) throw AppError.notFound('Order');
      if (order.characterId !== character.id) {
        throw AppError.forbidden('Chỉ người đặt lệnh mới được hủy.');
      }
      if (order.status !== 'open' && order.status !== 'partially_filled') {
        throw AppError.badRequest('Chỉ có thể hủy lệnh đang mở.');
      }

      if (order.side === 'buy') {
        const remaining = (order.amount - order.filledAmount) * Number(order.priceMinor);
        if (remaining > 0) {
          await ledger.transfer(client, {
            from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
            to: { ownerType: 'character', ownerId: character.id },
            amountMinor: remaining,
            kind: 'order_escrow_refund',
            description: `Hoàn escrow lệnh ${orderId}`,
            referenceType: 'order',
            referenceId: orderId,
          });
        }
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
    return { tickers, totalMarketCap: money(totalMarketCap), totalVolume24h, updatedAt: new Date().toISOString() };
  }

  /** Biến động giá theo giờ trong game (mô phỏng thị trường thật/AI-driven): random walk + xu hướng + biến động đột biến nhẹ. */
  async tickHourlyPrices(input?: { gameYear?: number; gameMonth?: number; gameDay?: number; gameHour?: number }) {
    return withTransaction(async (client) => {
      const tickers = await this.repository.listTickers();
      const seedBase = Number(input?.gameYear ?? 0) * 100000 + Number(input?.gameMonth ?? 0) * 1000 + Number(input?.gameDay ?? 0) * 100 + Number(input?.gameHour ?? 0);
      let i = 0;
      for (const t of tickers) {
        const current = Number(t.currentPriceMinor);
        // dao động kiểu thị trường: phần lớn nhỏ, thỉnh thoảng mạnh, có xu hướng nhẹ
        const r1 = Math.sin(seedBase * 12.9898 + i * 78.233) * 43758.5453;
        const noise = r1 - Math.floor(r1); // 0..1
        const r2 = Math.sin(seedBase * 93.989 + i * 12.345) * 27183.123;
        const noise2 = r2 - Math.floor(r2);
        let pct = (noise - 0.5) * 1.6; // ±0.8%
        pct += (noise2 - 0.5) * 0.6;   // thêm nhiễu
        // sự kiện/biến động đột biến nhẹ (mô phỏng tin tức/AI sentiment)
        if (noise > 0.97) pct += 1.2 + noise2 * 1.5;
        if (noise < 0.03) pct -= 1.2 + noise2 * 1.5;
        // neo nhẹ quanh previous close để tránh trôi vô hạn
        const prev = Number(t.previousCloseMinor || current);
        const drift = ((prev - current) / Math.max(prev, 1)) * 0.15;
        pct += drift * 100;
        pct = Math.max(-3.5, Math.min(3.5, pct));
        const newPrice = Math.max(100, Math.round(current * (1 + pct / 100)));
        const vol = Math.max(0, Math.round(50 + noise2 * 500 + Math.abs(pct) * 120)); // khối lượng giao dịch mô phỏng (cổ phiếu)
        await this.repository.updateTickerPrice(client, t.id, newPrice, vol);
        i++;
      }
      return { ok: true, count: tickers.length, at: input ?? null };
    });
  }
}

export const stockMarketService = new StockMarketService();
