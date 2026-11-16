import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import {
  type TickerDto,
  type OrderDto,
  type HoldingDto,
  type PortfolioDto,
  type TradeDto,
  type PlaceOrderResponse,
  MoneySchema,
} from '@efls/contracts';
import { stockMarketRepository } from './stock-market.repository.js';

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

function toTradeDto(
  row: Awaited<ReturnType<typeof stockMarketRepository.listTrades>>[number],
  viewerCharacterId: string,
): TradeDto {
  return {
    id: row.id,
    tickerId: row.tickerId,
    symbol: row.symbol,
    side: row.buyerCharacterId === viewerCharacterId ? 'buy' : 'sell',
    price: money(Number(row.priceMinor)),
    amount: row.amount,
    executedAt: row.executedAt.toISOString(),
  };
}

/**
 * Dịch vụ chứng khoán: mua/bán khớp NGAY tại giá thị trường hiện tại (không có lệnh mở/escrow).
 * Người mua/bán chịu giá tại thời điểm nhấn nút.
 */
export class StockMarketService {
  constructor(private readonly repository = stockMarketRepository) {}

  async getTickers() {
    const rows = await this.repository.listTickers();
    return rows.map(toTickerDto);
  }

  /** Không còn lệnh mở (giữ endpoint tương thích). */
  async getOrders(_userId: string): Promise<OrderDto[]> {
    return [];
  }

  async placeOrder(
    userId: string,
    tickerId: string,
    side: 'buy' | 'sell',
    amount: number,
  ): Promise<PlaceOrderResponse> {
    const qty = Math.trunc(Number(amount));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw AppError.badRequest('Số lượng cổ phiếu không hợp lệ.');
    }

    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const ticker = await this.repository.getTickerById(tickerId, client);
      if (!ticker) throw AppError.notFound('Ticker');

      const priceMinor = Number(ticker.currentPriceMinor);
      if (!Number.isFinite(priceMinor) || priceMinor <= 0) {
        throw AppError.conflict('invalid_price', 'Giá cổ phiếu hiện không hợp lệ.');
      }
      const total = priceMinor * qty;
      const nowIso = new Date().toISOString();

      if (side === 'buy') {
        const cash = toMinor(character.cash_minor);
        if (cash < total) {
          throw AppError.conflict(
            'insufficient_funds',
            `Không đủ tiền mặt để mua. Cần ${total.toLocaleString('vi-VN')} ₫ (giá ${priceMinor.toLocaleString('vi-VN')} ₫/CP), hiện có ${cash.toLocaleString('vi-VN')} ₫.`,
          );
        }

        await ledger.transfer(client, {
          from: { ownerType: 'character', ownerId: character.id },
          to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
          amountMinor: total,
          kind: 'stock_buy',
          description: `Mua ${qty} ${ticker.symbol} @ ${priceMinor.toLocaleString('vi-VN')} ₫ (khớp ngay)`,
          referenceType: 'ticker',
          referenceId: tickerId,
        });
        await this.repository.updateHolding(client, character.id, tickerId, qty, priceMinor);
        const tradeId = await this.repository.createTrade(client, tickerId, character.id, null, priceMinor, qty);

        const trade: TradeDto = { id: tradeId, tickerId, symbol: ticker.symbol, side: 'buy', price: money(priceMinor), amount: qty, executedAt: nowIso };
        return {
          ok: true,
          side,
          tickerId,
          symbol: ticker.symbol,
          amount: qty,
          executedPrice: money(priceMinor),
          total: money(total),
          trades: [trade],
          message: `Đã mua ngay ${qty} ${ticker.symbol} với giá ${priceMinor.toLocaleString('vi-VN')} ₫/CP, tổng ${total.toLocaleString('vi-VN')} ₫. Cổ phiếu đã thuộc sở hữu của bạn.`,
        };
      }

      // sell
      const holdings = await this.repository.listHoldings(character.id);
      const holding = holdings.find((h) => h.tickerId === tickerId);
      const ownedShares = holding?.shares ?? 0;
      if (ownedShares < qty) {
        throw AppError.conflict(
          'insufficient_shares',
          `Không đủ cổ phiếu để bán. Đang sở hữu ${ownedShares}, muốn bán ${qty}.`,
        );
      }

      try {
        await this.repository.updateHolding(client, character.id, tickerId, -qty);
      } catch (e) {
        throw AppError.conflict(
          'insufficient_shares',
          `Không thể cập nhật số cổ phiếu sở hữu khi bán. Vui lòng thử lại.`,
        );
      }
      await ledger.transfer(client, {
        from: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
        to: { ownerType: 'character', ownerId: character.id },
        amountMinor: total,
        kind: 'stock_sell',
        description: `Bán ${qty} ${ticker.symbol} @ ${priceMinor.toLocaleString('vi-VN')} ₫ (khớp ngay)`,
        referenceType: 'ticker',
        referenceId: tickerId,
      });
      const tradeId = await this.repository.createTrade(client, tickerId, null, character.id, priceMinor, qty);

      const trade: TradeDto = { id: tradeId, tickerId, symbol: ticker.symbol, side: 'sell', price: money(priceMinor), amount: qty, executedAt: nowIso };
      return {
        ok: true,
        side,
        tickerId,
        symbol: ticker.symbol,
        amount: qty,
        executedPrice: money(priceMinor),
        total: money(total),
        trades: [trade],
        message: `Đã bán ngay ${qty} ${ticker.symbol} với giá ${priceMinor.toLocaleString('vi-VN')} ₫/CP, thu về ${total.toLocaleString('vi-VN')} ₫.`,
      };
    });
  }

  async getPortfolio(userId: string): Promise<PortfolioDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const holdings = await this.repository.listHoldings(character.id);
    const holdingDtos = holdings.map(toHoldingDto);
    const totalMarketValue = holdingDtos.reduce((sum, h) => sum + h.marketValue.amount, 0);
    const totalUnrealizedPnl = holdingDtos.reduce((sum, h) => sum + h.unrealizedPnl.amount, 0);

    return {
      holdings: holdingDtos,
      openOrders: [],
      totalMarketValue: money(totalMarketValue),
      totalUnrealizedPnl: money(totalUnrealizedPnl),
    };
  }

  async getTrades(userId: string): Promise<TradeDto[]> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const rows = await this.repository.listTrades(character.id);
    return rows.map((row) => toTradeDto(row, character.id));
  }

  async getOrderBook(_tickerId: string) {
    // Không còn sổ lệnh mở; giữ endpoint tương thích.
    return { bids: [] as Array<{ priceMinor: number; amount: number }>, asks: [] as Array<{ priceMinor: number; amount: number }> };
  }

  async getMarketSnapshot() {
    const rows = await this.repository.listTickers();
    const tickers = rows.map(toTickerDto);
    const totalMarketCap = tickers.reduce((sum, t) => sum + t.currentPrice.amount, 0);
    const totalVolume24h = tickers.reduce((sum, t) => sum + t.totalVolume, 0);
    return { tickers, totalMarketCap: money(totalMarketCap), totalVolume24h, updatedAt: new Date().toISOString() };
  }

  /** Biến động giá theo giờ trong game (mô phỏng thị trường thật/AI-driven): random walk + xu hướng + biến động đột biến nhẹ + trend bias (admin). */
  async tickHourlyPrices(input?: { gameYear?: number; gameMonth?: number; gameDay?: number; gameHour?: number }) {
    return withTransaction(async (client) => {
      const tickersRes = await client.query(
        `SELECT t.id, t.company_id AS "companyId", t.symbol, c.name AS "companyName",
                t.current_price_minor AS "currentPriceMinor",
                t.previous_close_minor AS "previousCloseMinor",
                t.total_volume AS "totalVolume", t.is_ipo AS "isIpo"
         FROM stock_tickers t
         JOIN companies c ON c.id = t.company_id
         WHERE c.status = 'ipo'
         ORDER BY t.symbol`
      );
      const tickers = tickersRes.rows as Array<{ id: string; companyId: string; symbol: string; companyName: string; currentPriceMinor: string; previousCloseMinor: string; totalVolume: number; isIpo: boolean }>;

      // Dọn bias hết hạn (best-effort)
      await client.query(`DELETE FROM stock_market_biases WHERE ends_at <= now()`).catch(() => {});
      const biasRes = await client.query<{ ticker_id: string | null; scope: string; bias_pct: string }>(
        `SELECT ticker_id, scope, bias_pct FROM stock_market_biases WHERE ends_at > now()`
      );
      let globalBias = 0;
      const perTickerBias = new Map<string, number>();
      for (const b of biasRes.rows) {
        const bp = Number(b.bias_pct ?? 0);
        if (b.scope === 'ALL_MARKET' || !b.ticker_id) globalBias += bp;
        else perTickerBias.set(b.ticker_id, (perTickerBias.get(b.ticker_id) ?? 0) + bp);
      }

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

        // Trend bias do admin cấu hình (cộng thêm bias_pct trong thời gian hiệu lực)
        const biasPct = globalBias + (perTickerBias.get(t.id) ?? 0);
        pct += biasPct;

        pct = Math.max(-15, Math.min(15, pct));
        const newPrice = Math.max(100, Math.round(current * (1 + pct / 100)));
        const vol = Math.max(0, Math.round(50 + noise2 * 500 + Math.abs(pct) * 120)); // khối lượng giao dịch mô phỏng (cổ phiếu)
        await client.query(
          `UPDATE stock_tickers
              SET previous_close_minor = current_price_minor,
                  current_price_minor = $2::bigint,
                  total_volume = GREATEST(total_volume + $3::bigint, 0)
            WHERE id = $1::uuid`,
          [t.id, Math.max(100, newPrice), Math.max(0, Math.round(vol))],
        );
        i++;
      }
      return { ok: true, count: tickers.length, at: input ?? null };
    });
  }
}

export const stockMarketService = new StockMarketService();

