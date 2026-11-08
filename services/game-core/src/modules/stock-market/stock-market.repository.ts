import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface TickerRow {
  id: string;
  companyId: string;
  symbol: string;
  companyName: string;
  currentPriceMinor: string;
  previousCloseMinor: string;
  change24hPct: number;
  totalVolume: number;
  isIpo: boolean;
}

export interface OrderRow {
  id: string;
  tickerId: string;
  symbol: string;
  characterId: string;
  side: string;
  priceMinor: string;
  amount: number;
  filledAmount: number;
  status: string;
  createdAt: Date;
}

interface CreateOrderInput {
  characterId: string;
  tickerId: string;
  side: string;
  priceMinor: number;
  amount: number;
}

export interface HoldingRow {
  tickerId: string;
  symbol: string;
  companyName: string;
  shares: number;
  averageCostMinor: string;
  currentPriceMinor: string;
}

export interface TradeRow {
  id: string;
  tickerId: string;
  symbol: string;
  priceMinor: string;
  amount: number;
  executedAt: Date;
}

/** Truy cập bảng chứng khoán: stock_tickers, stock_orders, stock_holdings, stock_trades. */
export class StockMarketRepository {
  constructor(readonly db: Db = pool) {}

  async listTickers(): Promise<TickerRow[]> {
    const result = await this.db.query<TickerRow>(
      `SELECT t.id, t.company_id AS "companyId", t.symbol, c.name AS "companyName",
              t.current_price_minor AS "currentPriceMinor",
              t.previous_close_minor AS "previousCloseMinor",
              CASE WHEN t.previous_close_minor > 0
                THEN ROUND(100.0 * (t.current_price_minor - t.previous_close_minor) / t.previous_close_minor, 2)
                ELSE 0 END AS "change24hPct",
              t.total_volume AS "totalVolume", t.is_ipo AS "isIpo"
       FROM stock_tickers t
       JOIN companies c ON c.id = t.company_id
       ORDER BY t.symbol`,
    );
    return result.rows;
  }

  async listOrdersByCharacter(characterId: string): Promise<OrderRow[]> {
    const result = await this.db.query<OrderRow>(
      `SELECT o.id, o.ticker_id AS "tickerId", t.symbol, o.character_id AS "characterId",
              o.side, o.price_minor AS "priceMinor", o.amount, o.filled_amount AS "filledAmount",
              o.status, o.created_at AS "createdAt"
       FROM stock_orders o
       JOIN stock_tickers t ON t.id = o.ticker_id
       WHERE o.character_id = $1 AND o.status IN ('open', 'partially_filled')
       ORDER BY o.created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async createOrder(db: Db, input: CreateOrderInput): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO stock_orders (id, ticker_id, character_id, side, price_minor, amount, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'open')
       RETURNING id`,
      [input.tickerId, input.characterId, input.side, input.priceMinor, input.amount],
    );
    return result.rows[0]!.id;
  }

  async cancelOrder(db: Db, orderId: string, characterId: string): Promise<void> {
    await db.query(
      `UPDATE stock_orders SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND character_id = $2 AND status = 'open'`,
      [orderId, characterId],
    );
  }

  async listHoldings(characterId: string): Promise<HoldingRow[]> {
    const result = await this.db.query<HoldingRow>(
      `SELECT h.ticker_id AS "tickerId", t.symbol, c.name AS "companyName", h.shares,
              t.current_price_minor AS "currentPriceMinor",
              t.current_price_minor AS "averageCostMinor"
       FROM stock_holdings h
       JOIN stock_tickers t ON t.id = h.ticker_id
       JOIN companies c ON c.id = t.company_id
       WHERE h.character_id = $1 AND h.shares > 0
       ORDER BY t.symbol`,
      [characterId],
    );
    return result.rows;
  }

  async getOrderById(orderId: string): Promise<OrderRow | null> {
    const result = await this.db.query<OrderRow>(
      `SELECT o.id, o.ticker_id AS "tickerId", t.symbol, o.character_id AS "characterId",
              o.side, o.price_minor AS "priceMinor", o.amount, o.filled_amount AS "filledAmount",
              o.status, o.created_at AS "createdAt"
       FROM stock_orders o
       JOIN stock_tickers t ON t.id = o.ticker_id
       WHERE o.id = $1`,
      [orderId],
    );
    return result.rows[0] ?? null;
  }

  async listTrades(characterId: string): Promise<TradeRow[]> {
    const result = await this.db.query<TradeRow>(
      `SELECT tr.id, tr.ticker_id AS "tickerId", t.symbol, tr.price_minor AS "priceMinor",
              tr.amount, tr.executed_at AS "executedAt"
       FROM stock_trades tr
       JOIN stock_tickers t ON t.id = tr.ticker_id
       WHERE tr.buyer_character_id = $1 OR tr.seller_character_id = $1
       ORDER BY tr.executed_at DESC
       LIMIT 50`,
      [characterId],
    );
    return result.rows;
  }

  /** Sổ lệnh: mua (cao nhất trước) và bán (thấp nhất trước). */
  async getOrderBook(tickerId: string): Promise<{
    bids: Array<{ priceMinor: number; amount: number }>;
    asks: Array<{ priceMinor: number; amount: number }>;
  }> {
    const [bidsResult, asksResult] = await Promise.all([
      this.db.query<{ priceMinor: string; amount: string }>(
        `SELECT price_minor AS "priceMinor", (amount - filled_amount) AS "amount"
         FROM stock_orders
         WHERE ticker_id = $1::uuid AND side = 'buy' AND status IN ('open', 'partially_filled')
         ORDER BY price_minor DESC, created_at ASC`,
        [tickerId],
      ),
      this.db.query<{ priceMinor: string; amount: string }>(
        `SELECT price_minor AS "priceMinor", (amount - filled_amount) AS "amount"
         FROM stock_orders
         WHERE ticker_id = $1::uuid AND side = 'sell' AND status IN ('open', 'partially_filled')
         ORDER BY price_minor ASC, created_at ASC`,
        [tickerId],
      ),
    ]);
    return {
      bids: bidsResult.rows.map((r) => ({
        priceMinor: Number(r.priceMinor),
        amount: Number(r.amount),
      })),
      asks: asksResult.rows.map((r) => ({
        priceMinor: Number(r.priceMinor),
        amount: Number(r.amount),
      })),
    };
  }

  /** Cập nhật tiến độ khớp lệnh. */
  async updateOrderFilled(orderId: string, filledAmount: number, status: string): Promise<void> {
    await this.db.query(
      `UPDATE stock_orders SET filled_amount = $2, status = $3, updated_at = now() WHERE id = $1::uuid`,
      [orderId, filledAmount, status],
    );
  }

  /** Ghi lại một giao dịch khớp lệnh. */
  async createTrade(
    tickerId: string,
    buyerCharacterId: string,
    sellerCharacterId: string,
    priceMinor: number,
    amount: number,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO stock_trades (id, ticker_id, buyer_character_id, seller_character_id, price_minor, amount)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::bigint, $5)`,
      [tickerId, buyerCharacterId, sellerCharacterId, priceMinor, amount],
    );
    await this.db.query(
      `UPDATE stock_tickers SET current_price_minor = $2::bigint, previous_close_minor = current_price_minor,
               total_volume = total_volume + $3, updated_at = now()
       WHERE id = $1::uuid`,
      [tickerId, priceMinor, amount],
    );
  }

  /** Cập nhật số cổ phiếu sở hữu của một nhân vật (dùng sau khi khớp mua/bán). */
  async updateHolding(characterId: string, tickerId: string, deltaShares: number): Promise<void> {
    await this.db.query(
      `INSERT INTO stock_holdings (character_id, ticker_id, shares, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, now())
       ON CONFLICT (character_id, ticker_id)
       UPDATE SET shares = stock_holdings.shares + EXCLUDED.shares, updated_at = now()`,
      [characterId, tickerId, deltaShares],
    );
  }

  /** Lệnh bán tốt nhất ở một mức giá (dùng khi khớp lệnh mua). */
  async getBestAskOrder(
    tickerId: string,
    priceMinor: number,
  ): Promise<{
    id: string;
    characterId: string;
    filledAmount: number;
    amount: number;
  } | null> {
    const result = await this.db.query<{
      id: string;
      character_id: string;
      filled_amount: string;
      amount: string;
    }>(
      `SELECT id, character_id AS "characterId", filled_amount AS "filledAmount", amount
       FROM stock_orders
       WHERE ticker_id = $1::uuid AND side = 'sell' AND price_minor = $2::bigint
         AND status IN ('open', 'partially_filled')
         AND (amount - filled_amount) > 0
       ORDER BY created_at ASC
       LIMIT 1`,
      [tickerId, priceMinor],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      characterId: row.character_id,
      filledAmount: Number(row.filled_amount),
      amount: Number(row.amount),
    };
  }

  /** Lệnh mua tốt nhất ở một mức giá (dùng khi khớp lệnh bán). */
  async getBestBidOrder(
    tickerId: string,
    priceMinor: number,
  ): Promise<{
    id: string;
    characterId: string;
    filledAmount: number;
    amount: number;
  } | null> {
    const result = await this.db.query<{
      id: string;
      character_id: string;
      filled_amount: string;
      amount: string;
    }>(
      `SELECT id, character_id AS "characterId", filled_amount AS "filledAmount", amount
       FROM stock_orders
       WHERE ticker_id = $1::uuid AND side = 'buy' AND price_minor = $2::bigint
         AND status IN ('open', 'partially_filled')
         AND (amount - filled_amount) > 0
       ORDER BY created_at ASC
       LIMIT 1`,
      [tickerId, priceMinor],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      characterId: row.character_id,
      filledAmount: Number(row.filled_amount),
      amount: Number(row.amount),
    };
  }
}

export const stockMarketRepository = new StockMarketRepository();
