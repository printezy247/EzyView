/**
 * Journal statistics.
 *
 * Pure functions over entries so the panel, tests and (later) a CLI all agree
 * on what "win rate" and "expectancy" mean here.
 */
import { isClosed } from "./model";
import type { JournalEntry } from "./model";

export interface SymbolBreakdown {
  symbol: string;
  trades: number;
  netPnl: number;
  winRate: number;
}

export interface JournalStats {
  /** Closed trades only; open rows never move a number. */
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** 0..1 */
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  /** (winRate × avgWin) − ((1 − winRate) × avgLoss) */
  expectancy: number;
  /** grossProfit / |grossLoss|; Infinity when there is no losing trade. */
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  /** Largest peak-to-trough fall of the cumulative P&L curve. */
  maxDrawdown: number;
  bySymbol: SymbolBreakdown[];
}

const EMPTY: JournalStats = {
  trades: 0,
  wins: 0,
  losses: 0,
  breakeven: 0,
  winRate: 0,
  netPnl: 0,
  grossProfit: 0,
  grossLoss: 0,
  avgWin: 0,
  avgLoss: 0,
  expectancy: 0,
  profitFactor: 0,
  bestTrade: 0,
  worstTrade: 0,
  maxDrawdown: 0,
  bySymbol: [],
};

export function computeStats(entries: readonly JournalEntry[]): JournalStats {
  const closed = entries.filter(isClosed);
  if (closed.length === 0) return EMPTY;

  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let best = Number.NEGATIVE_INFINITY;
  let worst = Number.POSITIVE_INFINITY;

  for (const entry of closed) {
    const pnl = entry.pnl;
    if (pnl > 0) {
      wins += 1;
      grossProfit += pnl;
    } else if (pnl < 0) {
      losses += 1;
      grossLoss += pnl;
    } else {
      breakeven += 1;
    }
    if (pnl > best) best = pnl;
    if (pnl < worst) worst = pnl;
  }

  const trades = closed.length;
  const winRate = wins / trades;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0; // negative by sign
  const netPnl = grossProfit + grossLoss;

  return {
    trades,
    wins,
    losses,
    breakeven,
    winRate,
    netPnl,
    grossProfit,
    grossLoss,
    avgWin,
    avgLoss,
    expectancy: winRate * avgWin - (1 - winRate) * Math.abs(avgLoss),
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : grossProfit / Math.abs(grossLoss),
    bestTrade: best,
    worstTrade: worst,
    maxDrawdown: maxDrawdown(closed),
    bySymbol: bySymbol(closed),
  };
}

/** Peak-to-trough of the running total, in chronological order. */
function maxDrawdown(closed: readonly (JournalEntry & { pnl: number })[]): number {
  const timeline = closed
    .toSorted((a, b) => (a.exitTime ?? a.entryTime) - (b.exitTime ?? b.entryTime))
    .map((entry) => entry.pnl);

  let equity = 0;
  let peak = 0;
  let worst = 0;
  for (const pnl of timeline) {
    equity += pnl;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > worst) worst = drawdown;
  }
  return worst;
}

function bySymbol(closed: readonly (JournalEntry & { pnl: number })[]): SymbolBreakdown[] {
  const buckets = new Map<string, { trades: number; netPnl: number; wins: number }>();
  for (const entry of closed) {
    const bucket = buckets.get(entry.symbol) ?? { trades: 0, netPnl: 0, wins: 0 };
    bucket.trades += 1;
    bucket.netPnl += entry.pnl;
    if (entry.pnl > 0) bucket.wins += 1;
    buckets.set(entry.symbol, bucket);
  }
  return [...buckets.entries()]
    .map(([symbol, bucket]) => ({
      symbol,
      trades: bucket.trades,
      netPnl: bucket.netPnl,
      winRate: bucket.wins / bucket.trades,
    }))
    .toSorted((a, b) => b.netPnl - a.netPnl);
}
