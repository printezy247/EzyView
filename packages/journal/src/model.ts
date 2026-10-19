/**
 * EzyView trading journal domain model.
 *
 * Storage-agnostic on purpose: these shapes run against localStorage today and
 * SQLite/Postgres later without touching the UI.
 */

/** One closed (or open) trade, however it was captured. */
export interface JournalEntry {
  id: string;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: number;
  exitTime?: number;
  /** Realized P&L in account currency. */
  pnl?: number;
  fees?: number;
  /** Planned risk in account currency (for R-multiple math). */
  plannedRisk?: number;
  setup?: string;
  tags?: string[];
  notes?: string;
  screenshots?: string[];
  rating?: number;
  source?: "manual" | "mt5" | "ccxt" | "alpaca" | "paper";
}

/** A free-form journal note: session observation, plan, screenshot. */
export interface JournalNote {
  id: string;
  time: number;
  symbol?: string;
  text: string;
  tags?: string[];
  screenshots?: string[];
}

export type JournalItem =
  | { kind: "trade"; entry: JournalEntry }
  | { kind: "note"; note: JournalNote };

/** Marker for "this trade is closed and counted". */
export function isClosed(entry: JournalEntry): entry is JournalEntry & { pnl: number; exitTime: number } {
  return typeof entry.pnl === "number" && typeof entry.exitTime === "number";
}
