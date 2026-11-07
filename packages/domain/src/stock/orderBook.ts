export type OrderSide = 'buy' | 'sell';

export interface BookOrder {
  id: string;
  side: OrderSide;
  /** Price in minor units. */
  priceMinor: number;
  amount: number;
  /** Monotonic arrival sequence. Lower means earlier. */
  sequence: number;
}

export interface Trade {
  buyOrderId: string;
  sellOrderId: string;
  priceMinor: number;
  amount: number;
}

export interface MatchResult {
  trades: Trade[];
  /** Remaining open amount per order id. Fully filled orders are omitted. */
  remaining: Array<{ id: string; amount: number }>;
}

/**
 * Price-time priority matching (continuous double auction).
 * Trades execute at the resting (earlier) order's price.
 */
export function matchOrderBook(orders: readonly BookOrder[]): MatchResult {
  const buys = orders
    .filter((order) => order.side === 'buy' && order.amount > 0)
    .map((order) => ({ ...order }))
    .sort((a, b) => b.priceMinor - a.priceMinor || a.sequence - b.sequence);

  const sells = orders
    .filter((order) => order.side === 'sell' && order.amount > 0)
    .map((order) => ({ ...order }))
    .sort((a, b) => a.priceMinor - b.priceMinor || a.sequence - b.sequence);

  const trades: Trade[] = [];
  let buyIndex = 0;
  let sellIndex = 0;

  while (buyIndex < buys.length && sellIndex < sells.length) {
    const buy = buys[buyIndex];
    const sell = sells[sellIndex];
    if (!buy || !sell) break;

    if (buy.priceMinor < sell.priceMinor) break;

    const amount = Math.min(buy.amount, sell.amount);
    const resting = buy.sequence < sell.sequence ? buy : sell;

    trades.push({
      buyOrderId: buy.id,
      sellOrderId: sell.id,
      priceMinor: resting.priceMinor,
      amount,
    });

    buy.amount -= amount;
    sell.amount -= amount;

    if (buy.amount === 0) buyIndex += 1;
    if (sell.amount === 0) sellIndex += 1;
  }

  const remaining = [...buys, ...sells]
    .filter((order) => order.amount > 0)
    .map((order) => ({ id: order.id, amount: order.amount }));

  return { trades, remaining };
}

export function isCrossedBook(orders: readonly BookOrder[]): boolean {
  const bestBid = orders
    .filter((order) => order.side === 'buy')
    .reduce<number | null>(
      (best, order) => (best === null ? order.priceMinor : Math.max(best, order.priceMinor)),
      null,
    );

  const bestAsk = orders
    .filter((order) => order.side === 'sell')
    .reduce<number | null>(
      (best, order) => (best === null ? order.priceMinor : Math.min(best, order.priceMinor)),
      null,
    );

  if (bestBid === null || bestAsk === null) return false;
  return bestBid >= bestAsk;
}
