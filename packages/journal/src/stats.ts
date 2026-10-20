/**
 * Journal statistics.
 *
 * Pure functions over entries so the panel, tests and (later) a CLI all agree
 * on what "win rate" and "expectancy" mean here.
 */
import { isClosed } from "./model";
import type { JournalEntry } from "./model";

/** A trade with a known realized P&L; `exitTime` is handled via `?? entryTime`. */
type Closed = JournalEntry & { pnl: number };

export interface SymbolBreakdown {
  symbol: string;
  trades: number;
  netPnl: number;
  winRate: number;
}

export interface SetupBreakdown {
  setup: string;
  trades: number;
  netPnl: number;
  winRate: number;
}

export interface TagBreakdown {
  tag: string;
  trades: number;
  netPnl: number;
  winRate: number;
}

export interface TimeOfDayBreakdown {
  /** Entry-hour session: "Asia" 0–6, "London" 7–11, "Overlap" 12–16, "US" 17–23 UTC. */
  period: string;
  trades: number;
  netPnl: number;
  winRate: number;
}

/** One bucket of the fixed R-multiple histogram. */
export interface RBucket {
  label: string;
  count: number;
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
  /** Cumulative net P&L after each closed trade, chronological. */
  equitySeries: { time: number; equity: number }[];
  /** pnl / plannedRisk for closed trades with plannedRisk > 0, chronological. */
  rMultiples: number[];
  /** Counts per fixed R bucket; exactly 6 buckets when any trade is closed, [] otherwise. */
  rDistribution: RBucket[];
  bySetup: SetupBreakdown[];
  byTag: TagBreakdown[];
  byTimeOfDay: TimeOfDayBreakdown[];
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
  equitySeries: [],
  rMultiples: [],
  rDistribution: [],
  bySetup: [],
  byTag: [],
  byTimeOfDay: [],
};

/** Fixed R histogram buckets, in display order. */
const R_BUCKET_LABELS = ["≤-2", "-2..-1", "-1..0", "0..1", "1..2", "≥2"] as const;

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
  const rMultiples = rMultiplesOf(closed);

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
    equitySeries: equitySeries(closed),
    rMultiples,
    rDistribution: rDistributionOf(rMultiples),
    bySetup: bySetup(closed),
    byTag: byTag(closed),
    byTimeOfDay: byTimeOfDay(closed),
  };
}

/** Exit time when known, else entry time — the shared chronological ordering. */
function byTime(a: JournalEntry, b: JournalEntry): number {
  return (a.exitTime ?? a.entryTime) - (b.exitTime ?? b.entryTime);
}

/** Peak-to-trough of the running total, in chronological order. */
function maxDrawdown(closed: readonly Closed[]): number {
  const timeline = closed.toSorted(byTime).map((entry) => entry.pnl);

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

/** Cumulative net P&L after each closed trade, chronological. */
function equitySeries(closed: readonly Closed[]): { time: number; equity: number }[] {
  let equity = 0;
  return closed.toSorted(byTime).map((entry) => {
    equity += entry.pnl;
    return { time: entry.exitTime ?? entry.entryTime, equity };
  });
}

/** r = pnl / plannedRisk, chronological; trades without a positive risk are skipped. */
function rMultiplesOf(closed: readonly Closed[]): number[] {
  return closed
    .filter((entry): entry is Closed & { plannedRisk: number } => typeof entry.plannedRisk === "number" && entry.plannedRisk > 0)
    .toSorted(byTime)
    .map((entry) => entry.pnl / entry.plannedRisk);
}

/** Counts per fixed R bucket, always in display order. */
function rDistributionOf(rMultiples: readonly number[]): RBucket[] {
  const counts = new Map<(typeof R_BUCKET_LABELS)[number], number>();
  for (const r of rMultiples) {
    const label = rBucketLabel(r);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return R_BUCKET_LABELS.map((label) => ({ label, count: counts.get(label) ?? 0 }));
}

/** Bucket label for one R value: left edge included, right edge excluded. */
function rBucketLabel(r: number): (typeof R_BUCKET_LABELS)[number] {
  if (r < -2) return R_BUCKET_LABELS[0];
  if (r < -1) return R_BUCKET_LABELS[1];
  if (r < 0) return R_BUCKET_LABELS[2];
  if (r < 1) return R_BUCKET_LABELS[3];
  if (r < 2) return R_BUCKET_LABELS[4];
  return R_BUCKET_LABELS[5];
}

interface PnlBucket {
  trades: number;
  netPnl: number;
  wins: number;
}

/** Tally closed trades under every key they carry; undefined keys are skipped. */
function groupPnl(closed: readonly Closed[], keysOf: (entry: Closed) => readonly string[] | undefined): Map<string, PnlBucket> {
  const buckets = new Map<string, PnlBucket>();
  for (const entry of closed) {
    for (const key of keysOf(entry) ?? []) {
      const bucket = buckets.get(key) ?? { trades: 0, netPnl: 0, wins: 0 };
      bucket.trades += 1;
      bucket.netPnl += entry.pnl;
      if (entry.pnl > 0) bucket.wins += 1;
      buckets.set(key, bucket);
    }
  }
  return buckets;
}

/** Shared projection: bucket map → rows ordered by net P&L descending. */
function rankedRows(buckets: Map<string, PnlBucket>): { key: string; trades: number; netPnl: number; winRate: number }[] {
  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      trades: bucket.trades,
      netPnl: bucket.netPnl,
      winRate: bucket.wins / bucket.trades,
    }))
    .toSorted((a, b) => b.netPnl - a.netPnl);
}

function bySymbol(closed: readonly Closed[]): SymbolBreakdown[] {
  return rankedRows(groupPnl(closed, (entry) => [entry.symbol])).map((row) => ({
    symbol: row.key,
    trades: row.trades,
    netPnl: row.netPnl,
    winRate: row.winRate,
  }));
}

function bySetup(closed: readonly Closed[]): SetupBreakdown[] {
  return rankedRows(groupPnl(closed, (entry) => [entry.setup || "untagged"])).map((row) => ({
    setup: row.key,
    trades: row.trades,
    netPnl: row.netPnl,
    winRate: row.winRate,
  }));
}

function byTag(closed: readonly Closed[]): TagBreakdown[] {
  return rankedRows(groupPnl(closed, (entry) => entry.tags)).map((row) => ({
    tag: row.key,
    trades: row.trades,
    netPnl: row.netPnl,
    winRate: row.winRate,
  }));
}

function byTimeOfDay(closed: readonly Closed[]): TimeOfDayBreakdown[] {
  return rankedRows(groupPnl(closed, (entry) => [sessionFor(entry.entryTime)])).map((row) => ({
    period: row.key,
    trades: row.trades,
    netPnl: row.netPnl,
    winRate: row.winRate,
  }));
}

/** UTC hour of entryTime → session bucket. */
function sessionFor(entryTime: number): string {
  const hour = new Date(entryTime * 1000).getUTCHours();
  if (hour <= 6) return "Asia";
  if (hour <= 11) return "London";
  if (hour <= 16) return "Overlap";
  return "US";
}
