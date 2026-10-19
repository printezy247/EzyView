import type { PineOrder } from "./runtime.js";

export interface Trade {
  side: "long" | "short";
  entryBar: number;
  entryPrice: number;
  exitBar: number;
  exitPrice: number;
  qty: number;
  pnl: number;
  returnPct: number;
}

export interface BacktestResult {
  trades: Trade[];
  equity: number[];
  finalEquity: number;
  totalPnl: number;
  winRate: number;
  profitFactor: number | null;
  maxDrawdown: number;
  bars: number;
}

export interface BacktestOptions {
  /** Starting cash. */
  initialCash?: number;
  /** Close prices, one per bar, used to fill orders. */
  close: number[];
}

/**
 * Turn a script's recorded order intents into filled trades.
 *
 * Orders fill at the close of the bar that raised them — Pine's default when no
 * limit/stop is attached. A `close` order flattens the named position (or all
 * positions when the id is `"*"`). Positions are one unit unless the order
 * carried an explicit quantity.
 */
export function backtest(orders: PineOrder[], opts: BacktestOptions): BacktestResult {
  const { close, initialCash = 10_000 } = opts;

  const open = new Map<string, { side: "long" | "short"; price: number; qty: number; bar: number }>();
  const trades: Trade[] = [];
  const equity: number[] = [];

  // Process orders in bar order so fills respect the sequence the script saw.
  const sorted = orders.toSorted((a, b) => a.barIndex - b.barIndex);

  for (const order of sorted) {
    const price = close[order.barIndex];
    // A bar with no price cannot fill; skip rather than invent a level.
    if (price === undefined || Number.isNaN(price)) continue;

    if (order.action === "entry") {
      const key = order.id ?? order.side;
      const existing = open.get(key);
      if (existing) closePosition(existing, price, order.barIndex, trades);
      open.set(key, { side: order.side, price, qty: order.qty || 1, bar: order.barIndex });
      continue;
    }

    if (order.action === "close") {
      if (order.id === "*") {
        for (const pos of open.values()) closePosition(pos, price, order.barIndex, trades);
        open.clear();
        continue;
      }
      const key = order.id ?? "";
      const pos = open.get(key);
      if (pos) {
        closePosition(pos, price, order.barIndex, trades);
        open.delete(key);
      }
      continue;
    }

    // `exit` carries a stop or target in `qty`; without one it flattens at the
    // current close, which is the only price the bar guarantees.
    if (order.action === "exit") {
      const key = order.id ?? "";
      const pos = open.get(key);
      if (pos) {
        closePosition(pos, price, order.barIndex, trades);
        open.delete(key);
      }
    }
  }

  // Mark any still-open position to the last known close.
  const last = close[close.length - 1];
  if (last !== undefined) {
    for (const pos of open.values()) closePosition(pos, last, close.length - 1, trades);
    open.clear();
  }

  trades.sort((a, b) => a.entryBar - b.entryBar || a.exitBar - b.exitBar);
  buildEquity(trades, close, initialCash, equity);

  const finalEquity = equity[equity.length - 1] ?? initialCash;
  const wins = trades.filter((t) => t.pnl > 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = trades.filter((t) => t.pnl < 0).reduce((s, t) => s + Math.abs(t.pnl), 0);

  return {
    trades,
    equity,
    finalEquity,
    totalPnl: finalEquity - initialCash,
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    // A strategy with no losing trades has an undefined profit factor, not ∞.
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? null : 0) : grossProfit / grossLoss,
    maxDrawdown: maxDrawdown(equity),
    bars: close.length,
  };
}

function closePosition(
  pos: { side: "long" | "short"; price: number; qty: number; bar: number },
  exitPrice: number,
  exitBar: number,
  trades: Trade[],
): void {
  const gross = (exitPrice - pos.price) * pos.qty * (pos.side === "long" ? 1 : -1);
  trades.push({
    side: pos.side,
    entryBar: pos.bar,
    entryPrice: pos.price,
    exitBar,
    exitPrice,
    qty: pos.qty,
    pnl: gross,
    returnPct: pos.price === 0 ? 0 : ((exitPrice - pos.price) / pos.price) * (pos.side === "long" ? 1 : -1),
  });
}

/** Walk trades bar by bar, carrying open-position PnL into the equity curve. */
function buildEquity(trades: Trade[], close: number[], initialCash: number, equity: number[]): void {
  let cash = initialCash;
  const byExit = new Map<number, Trade[]>();
  for (const t of trades) {
    const list = byExit.get(t.exitBar);
    if (list) list.push(t);
    else byExit.set(t.exitBar, [t]);
  }

  for (let bar = 0; bar < close.length; bar++) {
    const closed = byExit.get(bar);
    if (closed) for (const t of closed) cash += t.pnl;
    equity.push(cash);
  }
}

/** Largest peak-to-trough drop across the equity curve, as a fraction. */
function maxDrawdown(equity: number[]): number {
  if (equity.length === 0) return 0;
  let peak = equity[0]!;
  let worst = 0;
  for (const value of equity) {
    if (value > peak) peak = value;
    if (peak > 0) {
      const drop = (peak - value) / peak;
      if (drop > worst) worst = drop;
    }
  }
  return worst;
}
