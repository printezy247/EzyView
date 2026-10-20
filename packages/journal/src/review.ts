/**
 * Daily/weekly review composer.
 *
 * Pure template text over a half-open `[start, end)` window: every number the
 * panel shows comes from here, so the UI, saved reviews and tests all agree on
 * wording and rounding. No clock, no storage — callers pass epoch seconds.
 */
import { isClosed } from "./model";
import type { JournalEntry, JournalNote } from "./model";
import { computeStats } from "./stats";

/** Local calendar date of an epoch-second timestamp, as `YYYY-MM-DD`. */
export function dateKey(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Half-open `[start, end)` epoch-second window for the day or ISO week a key
 * names. Daily spans the local midnights of that key; weekly spans Monday
 * 00:00 local through the following Monday 00:00 (ISO weeks start Monday).
 * Both ends are built from calendar components, so DST shifts move the
 * boundary with the clock instead of adding a fixed 24 h.
 */
// eslint-disable-next-line no-shadow -- public parameter name is `dateKey` by design.
export function reviewWindow(dateKey: string, period: "daily" | "weekly"): { start: number; end: number } {
  const [year = 0, month = 1, day = 1] = dateKey.split("-").map(Number);
  const keyDate = new Date(year, month - 1, day);

  if (period === "daily") {
    return windowOf(keyDate, new Date(year, month - 1, day + 1));
  }

  // ISO weekday of the key (Monday = 0 … Sunday = 6), then step back to Monday.
  const sinceMonday = (keyDate.getDay() + 6) % 7;
  return windowOf(new Date(year, month - 1, day - sinceMonday), new Date(year, month - 1, day - sinceMonday + 7));
}

/** Deterministic review text for entries (by `entryTime`) and notes in `[startSec, endSec)`. */
export function composeReview(
  entries: readonly JournalEntry[],
  notes: readonly JournalNote[],
  startSec: number,
  endSec: number,
): string {
  const inWindow = (time: number): boolean => time >= startSec && time < endSec;
  const windowed = entries.filter((entry) => inWindow(entry.entryTime));
  const windowNotes = notes.filter((item) => inWindow(item.time));

  if (windowed.length === 0 && windowNotes.length === 0) return "No trades and no notes.";

  const lines: string[] = [`Trades: ${windowed.length}`];
  const stats = computeStats(windowed);

  if (stats.trades > 0) {
    lines.push(`Wins ${stats.wins} · Losses ${stats.losses} · Breakeven ${stats.breakeven}`);
    lines.push(`Net ${money(stats.netPnl)}`);
    lines.push(`Win rate ${Math.round(stats.winRate * 100)}%`);
    if (stats.bestTrade !== 0) lines.push(`Best ${money(stats.bestTrade)}`);
    if (stats.worstTrade !== 0) lines.push(`Worst ${money(stats.worstTrade)}`);
  }

  let rulesDone = 0;
  let rulesTotal = 0;
  for (const entry of windowed) {
    if (!isClosed(entry) || !entry.rules?.length) continue;
    rulesTotal += entry.rules.length;
    for (const check of entry.rules) {
      if (check.done) rulesDone += 1;
    }
  }
  if (rulesTotal > 0) {
    lines.push(`Rule adherence ${Math.round((rulesDone / rulesTotal) * 100)}% (${rulesDone}/${rulesTotal})`);
  }

  if (windowNotes.length > 0) lines.push(`Notes ${windowNotes.length}`);

  return lines.join("\n");
}

/** Epoch seconds of two local midnights (or week boundaries), `end` exclusive. */
function windowOf(from: Date, to: Date): { start: number; end: number } {
  return { start: Math.floor(from.getTime() / 1000), end: Math.floor(to.getTime() / 1000) };
}

/** Fixed 2-decimal money with an explicit sign: `+12.50`, `-3.00`, `+0.00`. */
function money(value: number): string {
  const fixed = Math.abs(value).toFixed(2);
  if (Number(fixed) === 0) return `+${fixed}`;
  return `${value < 0 ? "-" : "+"}${fixed}`;
}
