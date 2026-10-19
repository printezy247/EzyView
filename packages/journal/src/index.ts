/**
 * EzyView trading journal.
 *
 * Domain model + statistics, independent of any storage layer so it can run
 * against SQLite, Postgres or localStorage.
 */

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
