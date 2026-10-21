import type { DividendEvent } from "@ezyview/data-adapters";

/**
 * Dividend arithmetic, kept out of the component so it can be tested.
 *
 * The calendar shows corporate actions, and the number a holder actually cares
 * about is the annualised run rate — a quarterly payment is not a yield until
 * it is scaled to a year. Scaling is done from the window that was actually
 * loaded, so a half-year of history is honestly reported as "annualised from
 * this window" rather than as a full year of payments.
 */

const YEAR_SECONDS = 365 * 86_400;

/**
 * The yearly rate implied by the payments inside `[from, to)`.
 *
 * `null` when the window holds no payments or has no length: there is no rate
 * to quote, and saying "0" would read as "this pays nothing".
 */
export function annualisedDividend(events: readonly DividendEvent[], from: number, to: number): number | null {
  const window = to - from;
  if (window <= 0) return null;
  const paid = events
    .filter((e) => e.exDate >= from && e.exDate < to)
    .reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0);
  if (events.filter((e) => e.exDate >= from && e.exDate < to).length === 0) return null;
  return (paid * YEAR_SECONDS) / window;
}

/** The next ex-date on or after `cursor`, or null when there is none left. */
export function nextExDate(events: readonly DividendEvent[], cursor: number): number | null {
  let best: number | null = null;
  for (const event of events) {
    if (event.exDate < cursor) continue;
    if (best === null || event.exDate < best) best = event.exDate;
  }
  return best;
}

/** Total paid across the ex-dates that fall in `year` (UTC). */
export function totalForYear(events: readonly DividendEvent[], year: number): number {
  return events
    .filter((e) => new Date(e.exDate * 1000).getUTCFullYear() === year)
    .reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0);
}
