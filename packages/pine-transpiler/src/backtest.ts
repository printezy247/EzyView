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
  /** Close prices, one per bar, used to fill orders when fillOnClose is true. */
  close: number[];
  /** Open prices, one per bar. When supplied and fillOnClose is false, orders fill on next bar open. */
  open?: number[];
  /** High prices, one per bar. */
  high?: number[];
  /** Low prices, one per bar. */
  low?: number[];
  /**
   * If true, fills orders at bar close (TradingView process_orders_on_close = true).
   * Defaults to true when open is omitted, and false when open is provided.
   */
  fillOnClose?: boolean;
  /** Slippage in price units added to buys and subtracted from sells. */
  slippage?: number;
  /** Commission cash amount per trade execution. */
  commission?: number;
  /** Contract multiplier (e.g. 100 for Gold, 100,000 for Forex). Default 1. */
  contractMultiplier?: number;
}

/**
 * Turn a script's recorded order intents into filled trades.
 *
 * Orders can fill at next bar open (default when open is provided) or at the
 * close of the bar that raised them (when fillOnClose is true).
 * A `close` order flattens the named position (or all positions when the id is `"*"`).
 */
export function backtest(orders: PineOrder[], opts: BacktestOptions): BacktestResult {
  const { close, initialCash = 10_000 } = opts;
  const fillOnClose = opts.fillOnClose ?? (opts.open === undefined);
  const slippage = opts.slippage ?? 0;
  const commission = opts.commission ?? 0;
  const multiplier = opts.contractMultiplier ?? 1;

  const openPositions = new Map<string, { side: "long" | "short"; price: number; qty: number; bar: number }>();
  const trades: Trade[] = [];
  const equity: number[] = [];

  // Process orders in bar order so fills respect the sequence the script saw.
  const sorted = [...orders].sort((a, b) => a.barIndex - b.barIndex);

  for (const order of sorted) {
    const fillBar = fillOnClose ? order.barIndex : order.barIndex + 1;
    if (fillBar >= close.length) continue;

    const rawPrice = fillOnClose
      ? close[fillBar]
      : (opts.open?.[fillBar] ?? close[fillBar]);

    // A bar with no price cannot fill; skip rather than invent a level.
    if (rawPrice === undefined || Number.isNaN(rawPrice)) continue;

    if (order.action === "entry") {
      const execPrice = order.side === "long" ? rawPrice + slippage : rawPrice - slippage;
      const key = order.id ?? order.side;
      const existing = openPositions.get(key);
      if (existing) {
        const exitPrice = existing.side === "long" ? rawPrice - slippage : rawPrice + slippage;
        closePosition(existing, exitPrice, fillBar, trades, multiplier, commission);
      }
      openPositions.set(key, { side: order.side, price: execPrice, qty: order.qty || 1, bar: fillBar });
      continue;
    }

    if (order.action === "close") {
      if (order.id === "*") {
        for (const pos of openPositions.values()) {
          const exitPrice = pos.side === "long" ? rawPrice - slippage : rawPrice + slippage;
          closePosition(pos, exitPrice, fillBar, trades, multiplier, commission);
        }
        openPositions.clear();
        continue;
      }
      const key = order.id ?? "";
      const pos = openPositions.get(key);
      if (pos) {
        const exitPrice = pos.side === "long" ? rawPrice - slippage : rawPrice + slippage;
        closePosition(pos, exitPrice, fillBar, trades, multiplier, commission);
        openPositions.delete(key);
      }
      continue;
    }

    // `exit` carries a stop or target in `qty`; without one it flattens at the
    // current execution price.
    if (order.action === "exit") {
      const key = order.id ?? "";
      const pos = openPositions.get(key);
      if (pos) {
        const exitPrice = pos.side === "long" ? rawPrice - slippage : rawPrice + slippage;
        closePosition(pos, exitPrice, fillBar, trades, multiplier, commission);
        openPositions.delete(key);
      }
    }
  }

  // Mark any still-open position to the last known close.
  const last = close[close.length - 1];
  if (last !== undefined) {
    for (const pos of openPositions.values()) {
      closePosition(pos, last, close.length - 1, trades, multiplier, 0);
    }
    openPositions.clear();
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
  multiplier: number = 1,
  commission: number = 0,
): void {
  const gross = (exitPrice - pos.price) * pos.qty * multiplier * (pos.side === "long" ? 1 : -1);
  const net = gross - commission * 2;
  trades.push({
    side: pos.side,
    entryBar: pos.bar,
    entryPrice: pos.price,
    exitBar,
    exitPrice,
    qty: pos.qty,
    pnl: net,
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
