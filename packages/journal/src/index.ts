/**
 * EzyView trading journal.
 *
 * Domain model, statistics and deal→trade import, independent of any storage
 * layer so it can run against SQLite, Postgres or localStorage.
 */
export { isClosed } from "./model";
export type { JournalEntry, JournalItem, JournalNote, RuleCheck, TradeEmotion } from "./model";
export { computeStats } from "./stats";
export type { JournalStats, RBucket, SetupBreakdown, SymbolBreakdown, TagBreakdown, TimeOfDayBreakdown } from "./stats";
export { entriesFromDeals, existingKeys } from "./import";
