/**
 * EzyView trading journal.
 *
 * Domain model, statistics and deal→trade import, independent of any storage
 * layer so it can run against SQLite, Postgres or localStorage.
 */
export { isClosed, planRewardRisk } from "./model";
export type {
  JournalEntry,
  JournalItem,
  JournalNote,
  PlanRiskReward,
  RuleCheck,
  TradeEmotion,
  TradePlan,
  TradePlanStatus,
} from "./model";
export { computeStats } from "./stats";
export type { JournalStats, RBucket, SetupBreakdown, SymbolBreakdown, TagBreakdown, TimeOfDayBreakdown } from "./stats";
export { composeReview, dateKey, reviewWindow } from "./review";
export { entriesFromDeals, existingKeys } from "./import";
