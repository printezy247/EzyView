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
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  sqn: number | null;
  maxConsecutiveLosses: number;
  avgWinLossRatio: number | null;
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

  interface Position {
    id: string;
    side: "long" | "short";
    price: number;
    qty: number;
    bar: number;
    bracket?: {
      stop?: number;
      limit?: number;
      trail?: { points?: number; offset?: number };
      oca?: string;
    };
  }

  const openPositions = new Map<string, Position>();
  const trades: Trade[] = [];
  const equity: number[] = [];

  // Group orders by the bar index they execute on.
  // In bar order so fills respect the sequence the script saw.
  const sorted = [...orders].sort((a, b) => a.barIndex - b.barIndex);
  const ordersByFillBar = new Map<number, PineOrder[]>();
  for (const order of sorted) {
    const fillBar = fillOnClose ? order.barIndex : order.barIndex + 1;
    if (fillBar < close.length) {
      const list = ordersByFillBar.get(fillBar) ?? [];
      list.push(order);
      ordersByFillBar.set(fillBar, list);
    }
  }

  for (let b = 0; b < close.length; b++) {
    const closeBar = close[b];
    if (closeBar === undefined || Number.isNaN(closeBar)) continue;

    const openBar = opts.open?.[b] ?? closeBar;
    const highBar = opts.high?.[b] ?? (opts.open !== undefined ? Math.max(openBar, closeBar) : closeBar);
    const lowBar = opts.low?.[b] ?? (opts.open !== undefined ? Math.min(openBar, closeBar) : closeBar);

    // 1. Check intrabar stop/limit brackets for positions open coming into bar b.
    for (const [key, pos] of Array.from(openPositions.entries())) {
      if (pos.bar >= b && fillOnClose) continue; // Entered at this bar's close; bracket applies from next bar
      if (!pos.bracket) continue;

      const { stop, limit } = pos.bracket;
      let exitPrice: number | null = null;

      if (pos.side === "long") {
        if (stop !== undefined && lowBar <= stop) {
          exitPrice = stop - slippage;
        } else if (limit !== undefined && highBar >= limit) {
          exitPrice = limit - slippage;
        }
      } else {
        if (stop !== undefined && highBar >= stop) {
          exitPrice = stop + slippage;
        } else if (limit !== undefined && lowBar <= limit) {
          exitPrice = limit + slippage;
        }
      }

      if (exitPrice !== null) {
        closePosition(pos, exitPrice, b, trades, multiplier, commission);
        openPositions.delete(key);
      }
    }

    // 2. Process orders scheduled to fill on bar b.
    const barOrders = ordersByFillBar.get(b) ?? [];
    const rawPrice = fillOnClose ? closeBar : openBar;

    for (const order of barOrders) {
      if (order.action === "entry") {
        const execPrice = order.side === "long" ? rawPrice + slippage : rawPrice - slippage;
        const key = order.id ?? order.side;
        const existing = openPositions.get(key);
        if (existing) {
          const exitPrice = existing.side === "long" ? rawPrice - slippage : rawPrice + slippage;
          closePosition(existing, exitPrice, b, trades, multiplier, commission);
        }
        openPositions.set(key, {
          id: key,
          side: order.side,
          price: execPrice,
          qty: order.qty || 1,
          bar: b,
        });
        continue;
      }

      if (order.action === "close") {
        if (order.id === "*") {
          for (const pos of openPositions.values()) {
            const exitPrice = pos.side === "long" ? rawPrice - slippage : rawPrice + slippage;
            closePosition(pos, exitPrice, b, trades, multiplier, commission);
          }
          openPositions.clear();
          continue;
        }
        const key = order.id ?? "";
        const pos = openPositions.get(key);
        if (pos) {
          const exitPrice = pos.side === "long" ? rawPrice - slippage : rawPrice + slippage;
          closePosition(pos, exitPrice, b, trades, multiplier, commission);
          openPositions.delete(key);
        }
        continue;
      }

      if (order.action === "exit") {
        const key = order.fromEntry ?? order.id ?? "";
        // Look up position by fromEntry/id, or first position if key matches or is default
        const pos = openPositions.get(key) ?? (openPositions.size === 1 ? openPositions.values().next().value : undefined);
        if (!pos) continue;

        if (order.stop !== undefined || order.limit !== undefined || order.trail !== undefined) {
          pos.bracket = {
            stop: order.stop,
            limit: order.limit,
            trail: order.trail,
            oca: order.oca,
          };
          // Check if this newly attached bracket triggers on bar b if entered at open
          if (!fillOnClose && pos.bar === b) {
            const { stop, limit } = pos.bracket;
            let exitPrice: number | null = null;
            if (pos.side === "long") {
              if (stop !== undefined && lowBar <= stop) exitPrice = stop - slippage;
              else if (limit !== undefined && highBar >= limit) exitPrice = limit - slippage;
            } else {
              if (stop !== undefined && highBar >= stop) exitPrice = stop + slippage;
              else if (limit !== undefined && lowBar <= limit) exitPrice = limit + slippage;
            }
            if (exitPrice !== null) {
              closePosition(pos, exitPrice, b, trades, multiplier, commission);
              openPositions.delete(pos.id);
            }
          }
        } else {
          // Market exit
          const exitPrice = pos.side === "long" ? rawPrice - slippage : rawPrice + slippage;
          closePosition(pos, exitPrice, b, trades, multiplier, commission);
          openPositions.delete(pos.id);
        }
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

  const pnlList = trades.map((t) => t.pnl);
  const n = pnlList.length;

  let sharpeRatio: number | null = null;
  let sortinoRatio: number | null = null;
  let sqn: number | null = null;
  let avgWinLossRatio: number | null = null;

  if (n >= 2) {
    const meanPnl = pnlList.reduce((s, p) => s + p, 0) / n;
    const variance = pnlList.reduce((s, p) => s + Math.pow(p - meanPnl, 2), 0) / (n - 1);
    const stdev = Math.sqrt(variance);

    if (stdev > 0) {
      sharpeRatio = Number((meanPnl / stdev).toFixed(2));
      sqn = Number((Math.sqrt(n) * (meanPnl / stdev)).toFixed(2));
    }

    const downsideVariance =
      pnlList.reduce((s, p) => s + (p < 0 ? Math.pow(p, 2) : 0), 0) / (n - 1);
    const downsideDev = Math.sqrt(downsideVariance);
    if (downsideDev > 0) {
      sortinoRatio = Number((meanPnl / downsideDev).toFixed(2));
    }
  }

  let maxConsecutiveLosses = 0;
  let currentLossStreak = 0;
  for (const t of trades) {
    if (t.pnl < 0) {
      currentLossStreak++;
      if (currentLossStreak > maxConsecutiveLosses) maxConsecutiveLosses = currentLossStreak;
    } else if (t.pnl > 0) {
      currentLossStreak = 0;
    }
  }

  const losingTrades = trades.filter((t) => t.pnl < 0);
  if (wins.length > 0 && losingTrades.length > 0) {
    const avgWin = grossProfit / wins.length;
    const avgLoss = grossLoss / losingTrades.length;
    if (avgLoss > 0) {
      avgWinLossRatio = Number((avgWin / avgLoss).toFixed(2));
    }
  }

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
    sharpeRatio,
    sortinoRatio,
    sqn,
    maxConsecutiveLosses,
    avgWinLossRatio,
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
