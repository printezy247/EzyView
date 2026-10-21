import type { Resolution } from "@ezyview/data-adapters";

import { RESOLUTION_GROUPS, resolutionName } from "./data";

/**
 * Custom interval entry for the toolbar's interval menu.
 *
 * `Resolution` is a closed union of the buckets the adapters can actually
 * serve, so this parser cannot invent one: it accepts a spelling a user might
 * type, normalises it to a supported resolution, and when the exact request
 * cannot be served it explains why and offers the nearest neighbour. Silently
 * rounding `7m` to `5m` would make the chart lie about what it is showing.
 */

export const SUPPORTED_INTERVALS: readonly Resolution[] = RESOLUTION_GROUPS.flatMap((g) => g.items);

export type ParseResult =
  | { ok: true; resolution: Resolution; label: string }
  | { ok: false; reason: string; suggestion?: Resolution };

/** `m`/`min`/`minute` -> minutes, `h`/`hr`/`hour` -> hours, `d`/`day` -> 1D, `w`/`week` -> 1W, `mo`/`month` -> 1M. */
const UNIT_ALIASES: Record<string, "m" | "h" | "d" | "w" | "mo"> = {
  m: "m",
  min: "m",
  mins: "m",
  minute: "m",
  minutes: "m",
  h: "h",
  hr: "h",
  hrs: "h",
  hour: "h",
  hours: "h",
  d: "d",
  day: "d",
  days: "d",
  w: "w",
  wk: "w",
  week: "w",
  weeks: "w",
  mo: "mo",
  month: "mo",
  months: "mo",
};

/** The counts the resolution table offers per unit bucket. */
const COUNTS: Record<"m" | "h", number[]> = {
  m: [1, 3, 5, 15, 30],
  h: [1, 2, 4, 6, 8, 12],
};

function supportedCount(unit: "m" | "h", count: number): Resolution | null {
  const candidate = `${count}${unit}` as Resolution;
  return SUPPORTED_INTERVALS.includes(candidate) ? candidate : null;
}

/** Nearest offered count for a unit, preferring the one below (you lose less). */
function nearestCount(unit: "m" | "h", count: number): number | null {
  const options = COUNTS[unit];
  let best: number | null = null;
  for (const option of options) {
    if (best === null || Math.abs(option - count) < Math.abs(best - count)) best = option;
  }
  return best;
}

export function parseInterval(input: string): ParseResult {
  const typed = input.trim();
  const cleaned = typed.toLowerCase();
  if (cleaned === "") return { ok: false, reason: "Type an interval, e.g. 15m or 4h." };

  // Split the leading digits from the unit, tolerating a space ("5 m").
  const match = /^(\d+)\s*([A-Za-z]+)$/.exec(typed);
  if (!match) return { ok: false, reason: `Could not read "${typed}" as an interval. Try 15m, 4h or 1d.` };

  const count = Number.parseInt(match[1]!, 10);
  const rawUnit = match[2]!;
  // `M` is a month and `m` a minute in the resolution table, so the unit's case
  // is load-bearing: only accept the upper-case spelling as a month.
  const unit = rawUnit === "M" || rawUnit === "mo" || rawUnit === "MO" ? "mo" : UNIT_ALIASES[rawUnit.toLowerCase()];
  if (!unit) return { ok: false, reason: `Unknown unit "${rawUnit}". Use m, h, d, w or mo.` };
  if (!Number.isFinite(count) || count < 1) return { ok: false, reason: "The count must be at least 1." };

  // Day and above are single buckets: 2 days is a week, not a two-day bar.
  if (unit === "d" || unit === "w" || unit === "mo") {
    const resolution: Resolution = unit === "d" ? "1D" : unit === "w" ? "1W" : "1M";
    if (count === 1) return { ok: true, resolution, label: resolutionName(resolution) };
    const fallback: Resolution = unit === "d" ? "1W" : "1M";
    return {
      ok: false,
      reason: `There is no ${count}-${unit === "d" ? "day" : unit} bar; the data is bucketed by ${resolutionName(fallback).split(" ")[1]}.`,
      suggestion: fallback,
    };
  }

  const exact = supportedCount(unit, count);
  if (exact) return { ok: true, resolution: exact, label: resolutionName(exact) };

  const near = nearestCount(unit, count);
  const suggestion = near === null ? undefined : `${near}${unit}` as Resolution;
  return {
    ok: false,
    reason: `${count}${unit} is not a served interval.`,
    ...(suggestion ? { suggestion } : {}),
  };
}
