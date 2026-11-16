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
  filledAmount?: number;
  status?: string;
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
  buyerCharacterId: string | null;
  sellerCharacterId: string | null;
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
       WHERE c.status <> 'bankrupt'
       ORDER BY t.symbol`,
    );
    return result.rows;
  }

  async getTickerById(tickerId: string, db: Db = this.db): Promise<TickerRow | null> {
    const result = await db.query<TickerRow>(
      `SELECT t.id, t.company_id AS "companyId", t.symbol, c.name AS "companyName",
              t.current_price_minor AS "currentPriceMinor",
              t.previous_close_minor AS "previousCloseMinor",
              CASE WHEN t.previous_close_minor > 0
                THEN ROUND(100.0 * (t.current_price_minor - t.previous_close_minor) / t.previous_close_minor, 2)
                ELSE 0 END AS "change24hPct",
              t.total_volume AS "totalVolume", t.is_ipo AS "isIpo"
       FROM stock_tickers t
       JOIN companies c ON c.id = t.company_id
       WHERE t.id = $1 AND c.status <> 'bankrupt'`,
      [tickerId],
    );
    return result.rows[0] ?? null;
  }

  async listOrdersByCharacter(characterId: string): Promise<OrderRow[]> {
    const result = await this.db.query<OrderRow>(
      `SELECT o.id, o.ticker_id AS "tickerId", t.symbol, o.character_id AS "characterId",
              o.side, o.price_minor AS "priceMinor", o.amount, o.filled_amount AS "filledAmount",
              o.status, o.created_at AS "createdAt"
       FROM stock_orders o
       JOIN stock_tickers t ON t.id = o.ticker_id
       JOIN companies c ON c.id = t.company_id
       WHERE o.character_id = $1 AND o.status IN ('open', 'partially_filled') AND c.status <> 'bankrupt'
       ORDER BY o.created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async createOrder(db: Db, input: CreateOrderInput): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO stock_orders (id, ticker_id, character_id, side, price_minor, amount, filled_amount, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.tickerId,
        input.characterId,
        input.side,
        input.priceMinor,
        input.amount,
        input.filledAmount ?? 0,
        input.status ?? 'open',
      ],
    );
    return result.rows[0]!.id;
  }

  async cancelOrder(db: Db, orderId: string, characterId: string): Promise<void> {
    await db.query(
      `UPDATE stock_orders SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND character_id = $2 AND status IN ('open','partially_filled')`,
      [orderId, characterId],
    );
  }

  async listHoldings(characterId: string): Promise<HoldingRow[]> {
    const result = await this.db.query<HoldingRow>(
      `SELECT h.ticker_id AS "tickerId", t.symbol, c.name AS "companyName", h.shares,
              t.current_price_minor AS "currentPriceMinor",
              COALESCE(h.avg_cost_minor, t.current_price_minor)::text AS "averageCostMinor"
       FROM stock_holdings h
       JOIN stock_tickers t ON t.id = h.ticker_id
       JOIN companies c ON c.id = t.company_id
       WHERE h.character_id = $1 AND h.shares > 0 AND c.status <> 'bankrupt'
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
      `SELECT tr.id, tr.ticker_id AS "tickerId", t.symbol,
              tr.buyer_character_id AS "buyerCharacterId",
              tr.seller_character_id AS "sellerCharacterId",
              tr.price_minor AS "priceMinor",
              tr.amount, tr.executed_at AS "executedAt"
       FROM stock_trades tr
       JOIN stock_tickers t ON t.id = tr.ticker_id
       JOIN companies c ON c.id = t.company_id
       WHERE (tr.buyer_character_id = $1 OR tr.seller_character_id = $1) AND c.status <> 'bankrupt'
       ORDER BY tr.executed_at DESC
       LIMIT 50`,
      [characterId],
    );
    return result.rows;
  }

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
      bids: bidsResult.rows.map((r) => ({ priceMinor: Number(r.priceMinor), amount: Number(r.amount) })),
      asks: asksResult.rows.map((r) => ({ priceMinor: Number(r.priceMinor), amount: Number(r.amount) })),
    };
  }

  async updateOrderFilled(db: Db, orderId: string, filledAmount: number, status: string): Promise<void> {
    await db.query(
      `UPDATE stock_orders SET filled_amount = $2, status = $3, updated_at = now() WHERE id = $1::uuid`,
      [orderId, filledAmount, status],
    );
  }

  async createTrade(
    db: Db,
    tickerId: string,
    buyerCharacterId: string | null,
    sellerCharacterId: string | null,
    priceMinor: number,
    amount: number,
    buyOrderId?: string | null,
    sellOrderId?: string | null,
  ): Promise<string> {
    const res = await db.query<{ id: string }>(
      `INSERT INTO stock_trades (id, ticker_id, buy_order_id, sell_order_id, buyer_character_id, seller_character_id, price_minor, amount)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::bigint, $7)
       RETURNING id`,
      [tickerId, buyOrderId ?? null, sellOrderId ?? null, buyerCharacterId ?? null, sellerCharacterId ?? null, priceMinor, amount],
    ).catch(() => ({ rows: [] as Array<{ id: string }> }));
    const id = res.rows[0]?.id ?? crypto.randomUUID();
    await db.query(
      `UPDATE stock_tickers
         SET current_price_minor = $2::bigint,
             total_volume = total_volume + $3::bigint
       WHERE id = $1::uuid`,
      [tickerId, Math.max(1, priceMinor), Math.max(0, amount)],
    );
    return id;
  }

  /** Cập nhật số cổ phiếu sở hữu và giá vốn trung bình (avg_cost_minor). */
  async updateHolding(
    db: Db,
    characterId: string,
    tickerId: string,
    deltaShares: number,
    tradePriceMinor?: number,
  ): Promise<void> {
    if (deltaShares > 0) {
      // Mua: cộng số lượng và cập nhật giá vốn trung bình
      await db.query(
        `INSERT INTO stock_holdings (character_id, ticker_id, shares, avg_cost_minor, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::bigint, now())
         ON CONFLICT (character_id, ticker_id)
         DO UPDATE SET
           avg_cost_minor = CASE
             WHEN COALESCE(stock_holdings.avg_cost_minor, 0) <= 0 OR stock_holdings.shares <= 0 THEN $4::bigint
             ELSE ROUND(((COALESCE(stock_holdings.avg_cost_minor, $4::bigint) * stock_holdings.shares) + ($4::bigint * $3))::numeric / GREATEST(stock_holdings.shares + $3, 1))::bigint
           END,
           shares = stock_holdings.shares + $3,
           updated_at = now()`,
        [characterId, tickerId, deltaShares, Math.max(1, Math.round(tradePriceMinor ?? 0))],
      ).catch(async () => {
        // fallback nếu DB chưa có cột avg_cost_minor
        await db.query(
          `INSERT INTO stock_holdings (character_id, ticker_id, shares, updated_at)
           VALUES ($1::uuid, $2::uuid, $3, now())
           ON CONFLICT (character_id, ticker_id)
           DO UPDATE SET shares = GREATEST(stock_holdings.shares + $3, 0), updated_at = now()`,
          [characterId, tickerId, deltaShares],
        );
      });
      return;
    }

    if (deltaShares < 0) {
      // Bán: trừ số lượng; nếu về 0 thì xóa dữ liệu sở hữu (không để dữ liệu "rác" còn lại)
      const sellQty = Math.abs(deltaShares);
      const res = await db.query<{ shares: number }>(
        `UPDATE stock_holdings
            SET shares = shares - $3,
                updated_at = now()
          WHERE character_id = $1::uuid AND ticker_id = $2::uuid AND shares >= $3
          RETURNING shares`,
        [characterId, tickerId, sellQty],
      );
      if (!res.rows[0]) {
        throw new Error('insufficient_shares_or_holding_missing');
      }
      const remaining = Number(res.rows[0].shares);
      if (remaining <= 0) {
        await db.query(
          `DELETE FROM stock_holdings WHERE character_id = $1::uuid AND ticker_id = $2::uuid`,
          [characterId, tickerId],
        );
      }
    }
  }

  async getBestAskOrder(
    tickerId: string,
    priceMinor: number,
    db: Db = this.db,
  ): Promise<{ id: string; characterId: string; filledAmount: number; amount: number } | null> {
    const result = await db.query<{ id: string; characterId: string; filledAmount: string; amount: string }>(
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
    return { id: row.id, characterId: row.characterId, filledAmount: Number(row.filledAmount), amount: Number(row.amount) };
  }

  async getBestBidOrder(
    tickerId: string,
    priceMinor: number,
    db: Db = this.db,
  ): Promise<{ id: string; characterId: string; filledAmount: number; amount: number } | null> {
    const result = await db.query<{ id: string; characterId: string; filledAmount: string; amount: string }>(
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
    return { id: row.id, characterId: row.characterId, filledAmount: Number(row.filledAmount), amount: Number(row.amount) };
  }

  async updateTickerPrice(db: Db, tickerId: string, newPriceMinor: number, volumeDelta: number): Promise<void> {
    await db.query(
      `UPDATE stock_tickers
         SET previous_close_minor = current_price_minor,
             current_price_minor = $2::bigint,
             total_volume = GREATEST(total_volume + $3::bigint, 0)
       WHERE id = $1::uuid`,
      [tickerId, Math.max(1, Math.round(newPriceMinor)), Math.max(0, Math.round(volumeDelta))],
    );
  }
}

export const stockMarketRepository = new StockMarketRepository();
