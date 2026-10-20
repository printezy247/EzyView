/**
 * Small pure helpers shared by the journal views (calendar heat, prop-firm bar).
 *
 * Kept out of the JSX so vitest can cover them without a DOM; each one is a
 * one-liner the views would otherwise re-derive with slightly different rules.
 */
import { dateKey } from "@ezyview/journal";
import type { JournalEntry } from "@ezyview/journal";

/** Net P&L per local day key; entries counted by `entryTime`, open rows skipped. */
export function dayNets(entries: readonly JournalEntry[]): Map<string, number> {
  const nets = new Map<string, number>();
  for (const entry of entries) {
    if (typeof entry.pnl !== "number") continue;
    const key = dateKey(entry.entryTime);
    nets.set(key, (nets.get(key) ?? 0) + entry.pnl);
  }
  return nets;
}

/** Net P&L of entries (with a realized `pnl`) on the local day containing `epochSec`. */
export function dayNetOn(entries: readonly JournalEntry[], epochSec: number): number {
  return dayNets(entries).get(dateKey(epochSec)) ?? 0;
}

/** Trades count per local day key, keyed by `entryTime` (open rows count too). */
export function dayCounts(entries: readonly JournalEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = dateKey(entry.entryTime);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Prop-firm daily loss breached: the day's net is at or below −limit. */
export function isDailyLossBreached(net: number, limit: number | undefined): boolean {
  return typeof limit === "number" && limit > 0 && net <= -limit;
}

/** Prop-firm max drawdown breached: the peak-to-trough fall is at or over the limit. */
export function isDrawdownBreached(drawdown: number, limit: number | undefined): boolean {
  return typeof limit === "number" && limit > 0 && drawdown >= limit;
}
