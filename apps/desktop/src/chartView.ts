/**
 * Pure helpers for the chart's bottom bar: range presets, go-to-date and the
 * clock. The chart itself is driven through the export bridge's `view`
 * controls; nothing here touches the DOM.
 */

const DAY = 86400;

export type RangePreset = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "All";

export const RANGE_PRESETS: { id: RangePreset; description: string }[] = [
  { id: "1D", description: "Show the last 1 day" },
  { id: "5D", description: "Show the last 5 days" },
  { id: "1M", description: "Show the last 1 month" },
  { id: "3M", description: "Show the last 3 months" },
  { id: "6M", description: "Show the last 6 months" },
  { id: "YTD", description: "Show from the start of this year" },
  { id: "1Y", description: "Show the last 1 year" },
  { id: "5Y", description: "Show the last 5 years" },
  { id: "All", description: "Show all loaded history" },
];

const SPAN_DAYS: Partial<Record<RangePreset, number>> = { "1D": 1, "5D": 5, "1M": 30, "3M": 91, "6M": 182, "1Y": 365, "5Y": 5 * 365 };

/** First visible time for a preset ending at `lastTime`; null means "fit everything". */
export function rangeStart(preset: RangePreset, lastTime: number): number | null {
  if (preset === "All") return null;
  if (preset === "YTD") return Date.UTC(new Date(lastTime * 1000).getUTCFullYear(), 0, 1) / 1000;
  return lastTime - (SPAN_DAYS[preset] ?? 1) * DAY;
}

/** History cap: a 5Y view of a 1-minute chart is clamped, not honoured. */
export const MAX_HISTORY_BARS = 5000;

/** Bars to load so the series reaches back to `from`, with a little slack. */
export function barsNeeded(from: number, lastTime: number, stepSeconds: number): number {
  return Math.min(MAX_HISTORY_BARS, Math.max(5, Math.ceil((lastTime - from) / stepSeconds) + 5));
}

/** `YYYY-MM-DD` (an <input type=date> value) → epoch seconds at 00:00 UTC; null if not a real date. */
export function parseGoToDate(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / 1000;
}

/**
 * `13:26:55 UTC+8`; an unknown zone falls back to the machine's own.
 *
 * The formatters are cached per zone: building an `Intl.DateTimeFormat` is
 * expensive, and this runs once a second.
 */
const clockFormatters = new Map<string, { time: Intl.DateTimeFormat; label: Intl.DateTimeFormat }>();

function formattersFor(zone: string | undefined): { time: Intl.DateTimeFormat; label: Intl.DateTimeFormat } {
  const key = zone ?? "";
  const cached = clockFormatters.get(key);
  if (cached) return cached;
  const built = {
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }),
    label: new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" }),
  };
  clockFormatters.set(key, built);
  return built;
}

export function formatClock(nowMs: number, timeZone?: string): string {
  const build = (zone: string | undefined) => {
    const { time: timeFormat, label: labelFormat } = formattersFor(zone);
    const time = timeFormat.format(nowMs);
    const label =
      labelFormat
        .formatToParts(nowMs)
        .find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${time} ${label.replace("GMT", "UTC").replace(/^UTC\+0$/, "UTC")}`.trim();
  };
  try {
    return build(timeZone || undefined);
  } catch {
    return build(undefined);
  }
}
