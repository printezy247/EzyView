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
  /** Unannualized mean bar return divided by the sample standard deviation of bar returns. */
  sharpeRatio: number | null;
  /** Unannualized mean bar return divided by downside deviation, using a zero return target. */
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

  const openPositions = new Map<string, { side: "long" | "short"; price: number; qty: number; bar: number }>();
  const trades: Trade[] = [];
  const equity: number[] = [];

  // Process orders in bar order so fills respect the sequence the script saw.
  const sorted = [...orders].sort((a, b) => a.barIndex - b.barIndex);

  for (const order of sorted) {
    const fillBar = fillOnClose ? order.barIndex : order.barIndex + 1;
    if (fillBar >= close.length) continue;

    let rawPrice = fillOnClose
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
        const barOpen = opts.open?.[fillBar] ?? rawPrice;
        const barHigh = opts.high?.[fillBar];
        const barLow = opts.low?.[fillBar];
        const stopHit = order.stop !== undefined && (pos.side === "long"
          ? (barLow !== undefined && barLow <= order.stop)
          : (barHigh !== undefined && barHigh >= order.stop));
        const limitHit = order.limit !== undefined && (pos.side === "long"
          ? (barHigh !== undefined && barHigh >= order.limit)
          : (barLow !== undefined && barLow <= order.limit));

        if (order.stop !== undefined || order.limit !== undefined) {
          // Conservative same-bar assumption: if both levels hit, stop fills first.
          if (stopHit) rawPrice = pos.side === "long" ? Math.min(barOpen, order.stop!) : Math.max(barOpen, order.stop!);
          else if (limitHit) rawPrice = pos.side === "long" ? Math.max(barOpen, order.limit!) : Math.min(barOpen, order.limit!);
          else continue;
        }
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
  buildEquity(trades, close, initialCash, multiplier, commission, equity);

  const finalEquity = equity[equity.length - 1] ?? initialCash;
  const wins = trades.filter((t) => t.pnl > 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = trades.filter((t) => t.pnl < 0).reduce((s, t) => s + Math.abs(t.pnl), 0);

  const pnlList = trades.map((t) => t.pnl);
  const n = pnlList.length;

  let sqn: number | null = null;
  let avgWinLossRatio: number | null = null;

  if (n >= 2) {
    const meanPnl = pnlList.reduce((s, p) => s + p, 0) / n;
    const variance = pnlList.reduce((s, p) => s + Math.pow(p - meanPnl, 2), 0) / (n - 1);
    const stdev = Math.sqrt(variance);

    if (stdev > 0) {
      sqn = Number((Math.sqrt(n) * (meanPnl / stdev)).toFixed(2));
    }
  }

  const { sharpeRatio, sortinoRatio } = barReturnRatios(equity);

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
function buildEquity(
  trades: Trade[],
  close: number[],
  initialCash: number,
  multiplier: number,
  commission: number,
  equity: number[],
): void {
  let cash = initialCash;
  const byEntry = new Map<number, Trade[]>();
  const byExit = new Map<number, Trade[]>();
  for (const t of trades) {
    const entries = byEntry.get(t.entryBar);
    if (entries) entries.push(t);
    else byEntry.set(t.entryBar, [t]);

    const list = byExit.get(t.exitBar);
    if (list) list.push(t);
    else byExit.set(t.exitBar, [t]);
  }

  const open = new Set<Trade>();
  for (let bar = 0; bar < close.length; bar++) {
    for (const trade of byEntry.get(bar) ?? []) {
      if (trade.exitBar > bar) open.add(trade);
    }

    const closed = byExit.get(bar);
    if (closed) {
      for (const trade of closed) {
        cash += trade.pnl;
        open.delete(trade);
      }
    }

    const mark = close[bar];
    let unrealized = 0;
    if (mark !== undefined && Number.isFinite(mark)) {
      for (const trade of open) {
        const direction = trade.side === "long" ? 1 : -1;
        unrealized += (mark - trade.entryPrice) * trade.qty * multiplier * direction - commission;
      }
    }
    equity.push(cash + unrealized);
  }
}

/** Ratios are per-bar and unannualized because the input has no timeframe. */
function barReturnRatios(equity: number[]): { sharpeRatio: number | null; sortinoRatio: number | null } {
  const returns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const previous = equity[i - 1]!;
    const current = equity[i]!;
    if (previous !== 0 && Number.isFinite(previous) && Number.isFinite(current)) {
      returns.push(current / previous - 1);
    }
  }

  if (returns.length < 2) return { sharpeRatio: null, sortinoRatio: null };

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const stdev = Math.sqrt(variance);
  const downsideDeviation = Math.sqrt(returns.reduce((sum, value) => sum + Math.min(value, 0) ** 2, 0) / returns.length);

  return {
    sharpeRatio: stdev > 0 ? Number((mean / stdev).toFixed(2)) : null,
    sortinoRatio: downsideDeviation > 0 ? Number((mean / downsideDeviation).toFixed(2)) : null,
  };
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
