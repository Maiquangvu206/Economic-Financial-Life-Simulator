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
}

export const stockMarketRepository = new StockMarketRepository();
