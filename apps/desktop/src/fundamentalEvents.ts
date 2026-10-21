import type { EconomicEvent, EarningsReport } from "@ezyview/data-adapters";
import type { FundamentalEventOverlay } from "@ezyview/chart-engine";
import { fundamentalOverlays } from "@ezyview/fundamentals";
import { toOverlayOptions } from "./eventOptions";
import type { EventOptions } from "./eventOptions";

const DAY = 86400;

/** Shared empty overlay: clears the chart's fundamentals layer. */
export const EMPTY_FUNDAMENTAL_EVENTS: FundamentalEventOverlay = { markers: [], lines: [] };

/** The two adapters this helper reads; `buildSources` output satisfies both. */
export interface FundamentalEventSources {
  calendar: { getCalendar(from: number, to: number): Promise<EconomicEvent[]> };
  earnings: { getEarnings(symbol: string): Promise<EarningsReport[]> };
}

/**
 * Earnings + economic events (as chosen in the event options) for one symbol, shaped for
 * `ChartHost.setFundamentalEvents`. Any fetch failure degrades to the empty
 * overlay so a missing feed never breaks the chart.
 */
export async function fetchFundamentalEvents(
  sources: FundamentalEventSources,
  symbol: string,
  now: number,
  options: EventOptions,
): Promise<FundamentalEventOverlay> {
  try {
    const [earnings, events] = await Promise.all([
      sources.earnings.getEarnings(symbol),
      sources.calendar.getCalendar(now - 60 * DAY, now + 60 * DAY),
    ]);
    return fundamentalOverlays(earnings, events, toOverlayOptions(options));
  } catch {
    return EMPTY_FUNDAMENTAL_EVENTS;
  }
}
