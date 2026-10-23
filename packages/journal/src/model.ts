/**
 * EzyView trading journal domain model.
 *
 * Storage-agnostic on purpose: these shapes run against localStorage today and
 * SQLite/Postgres later without touching the UI.
 */

/** How the trader felt when the trade was taken (review metadata). */
export type TradeEmotion = "calm" | "confident" | "anxious" | "fomo" | "revenge" | "tired";

/** One item on the trade's pre-flight rule checklist. */
export interface RuleCheck {
  label: string;
  done: boolean;
}

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
  emotion?: TradeEmotion;
  rules?: RuleCheck[];
  stopPrice?: number;
  targetPrice?: number;
  /** Maximum Adverse Excursion: furthest drawdown suffered during the trade. */
  mae?: number;
  /** Maximum Favorable Excursion: highest unrealized profit reached during the trade. */
  mfe?: number;
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

/** Where a pre-trade plan ended up. */
export type TradePlanStatus = "planned" | "executed" | "missed" | "cancelled";

/**
 * A trade thesis recorded before the entry.
 *
 * Plans are deliberately separate from `JournalEntry`: the point is to compare
 * what was intended with what was executed, and a plan can be missed or
 * cancelled without ever becoming a trade.
 */
export interface TradePlan {
  id: string;
  symbol: string;
  side: "long" | "short";
  createdAt: number;
  entry?: number;
  stop?: number;
  target?: number;
  setup?: string;
  thesis?: string;
  status: TradePlanStatus;
}

export interface PlanRiskReward {
  /** Distance from entry to stop, in price. */
  risk: number;
  /** Distance from entry to target, in price. */
  reward: number;
  /** reward / risk; 2 means a 2R plan. */
  ratio: number;
}

/** R:R from the plan's own levels, or null when a level is missing/zero-risk. */
export function planRewardRisk(plan: Pick<TradePlan, "entry" | "stop" | "target">): PlanRiskReward | null {
  const { entry, stop, target } = plan;
  if (entry === undefined || stop === undefined || target === undefined) return null;
  if (![entry, stop, target].every((value) => Number.isFinite(value))) return null;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  if (risk <= 0 || reward <= 0) return null;
  return { risk, reward, ratio: reward / risk };
}

export type JournalItem =
  | { kind: "trade"; entry: JournalEntry }
  | { kind: "note"; note: JournalNote };

/** Marker for "this trade is closed and counted". */
export function isClosed(entry: JournalEntry): entry is JournalEntry & { pnl: number; exitTime: number } {
  return typeof entry.pnl === "number" && typeof entry.exitTime === "number";
}
