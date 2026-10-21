import type { EconomicEvent, EarningsReport, EpochSeconds, Impact, NewsItem } from "@ezyview/data-adapters";

export interface EventFilterOptions {
  /** `"all"` or omitted = no impact filtering; otherwise keep only that impact. */
  impact?: Impact | "all";
  /** Case-insensitive exact match on `event.currency`. */
  currency?: string;
  /** Case-insensitive substring over `title` and `currency`. */
  search?: string;
  /** Inclusive lower bound on `event.time`. */
  from?: EpochSeconds;
  /** Exclusive upper bound on `event.time`. */
  to?: EpochSeconds;
}

/** A chart overlay row: an earnings dot or an economic-event marker/line. */
export interface FundamentalMarker {
  time: EpochSeconds;
  title: string;
  kind: "earnings" | "event";
  impact?: Impact;
}

export interface OverlayOptions {
  /** Lowest impact included as an event marker + line. Default `"high"`. */
  minImpact?: Impact;
  /** Exact impacts to include; when set it replaces the `minImpact` rule (empty = no events). */
  impacts?: readonly Impact[];
  /** Include earnings dots. Default true. */
  showEarnings?: boolean;
  /** Include economic-event markers and lines. Default true. */
  showEvents?: boolean;
  /** Reserved for future date filtering (pass-through, unused in v1). */
  now?: EpochSeconds;
}

/** Rank for minImpact comparison: high > medium > low > none. */
const IMPACT_RANK: Record<Impact, number> = { high: 3, medium: 2, low: 1, none: 0 };

/**
 * Filter economic calendar events with AND semantics. Never mutates the input.
 * `from` is inclusive, `to` is exclusive; currency and search are case-insensitive.
 */
export function filterEvents(events: readonly EconomicEvent[], opts: EventFilterOptions): EconomicEvent[] {
  const impact = opts.impact ?? "all";
  const currency = opts.currency?.trim().toLowerCase();
  const search = opts.search?.trim().toLowerCase() ?? "";
  return events.filter((e) => {
    if (impact !== "all" && e.impact !== impact) return false;
    if (currency !== undefined && currency !== "" && e.currency.toLowerCase() !== currency) return false;
    if (search && !e.title.toLowerCase().includes(search) && !e.currency.toLowerCase().includes(search)) return false;
    if (opts.from !== undefined && e.time < opts.from) return false;
    if (opts.to !== undefined && e.time >= opts.to) return false;
    return true;
  });
}

/**
 * Case-insensitive substring filter over `headline` and `summary`.
 * Empty or whitespace search returns the input as-is.
 */
export function filterNews(items: readonly NewsItem[], search: string): NewsItem[] {
  const q = search.trim().toLowerCase();
  if (!q) return items.slice();
  return items.filter((n) => n.headline.toLowerCase().includes(q) || (n.summary?.toLowerCase().includes(q) ?? false));
}

/**
 * Merge earnings reports and high-impact economic events into chart overlays.
 *
 * Earnings become `kind:"earnings"` markers (rows without a finite `time` are
 * dropped). Events with `impact` at or above `minImpact` (default `"high"`)
 * become `kind:"event"` markers and contribute their `time` to `lines`.
 * Markers are deduped by (`time`,`title`) and sorted ascending by time;
 * `lines` are unique event times, sorted ascending. Never mutates the inputs.
 */
export function fundamentalOverlays(
  earnings: readonly EarningsReport[],
  events: readonly EconomicEvent[],
  opts: OverlayOptions,
): { markers: FundamentalMarker[]; lines: number[] } {
  // Reserved for future date filtering (pass-through, unused in v1).
  void opts.now;

  const minImpact = opts.minImpact ?? "high";
  const seen = new Set<string>();
  const markers: FundamentalMarker[] = [];
  const push = (m: FundamentalMarker): void => {
    const key = `${m.time}\u0000${m.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    markers.push(m);
  };

  for (const row of opts.showEarnings === false ? [] : earnings) {
    if (Number.isFinite(row.time)) push({ time: row.time, title: row.symbol, kind: "earnings" });
  }

  const lineSet = new Set<number>();
  const allowed = opts.impacts ? new Set<Impact>(opts.impacts) : null;
  for (const ev of opts.showEvents === false ? [] : events) {
    if (allowed ? !allowed.has(ev.impact) : IMPACT_RANK[ev.impact] < IMPACT_RANK[minImpact]) continue;
    lineSet.add(ev.time);
    push({ time: ev.time, title: ev.title, kind: "event", impact: ev.impact });
  }

  markers.sort((a, b) => a.time - b.time);
  return { markers, lines: Array.from(lineSet).toSorted((a, b) => a - b) };
}
