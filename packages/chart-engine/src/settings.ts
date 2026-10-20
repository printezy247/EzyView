import { CrosshairMode, PriceScaleMode, TickMarkType, type TickMarkFormatter, type Time, type TimeFormatterFn, type UTCTimestamp } from "lightweight-charts";

/** Named crosshair interaction styles the UI exposes. */
export type CrosshairModeName = "normal" | "magnet" | "hidden";

/** Named right price-scale renderings the UI exposes. */
export type PriceScaleModeName = "normal" | "log" | "percentage";

/** Map a crosshair mode name onto the Lightweight Charts enum. Unknown → normal. */
export function crosshairModeOf(mode: CrosshairModeName | undefined): CrosshairMode {
  if (mode === "magnet") return CrosshairMode.Magnet;
  if (mode === "hidden") return CrosshairMode.Hidden;
  return CrosshairMode.Normal;
}

/** Map a price-scale mode name onto the Lightweight Charts enum. Unknown → normal. */
export function priceScaleModeOf(mode: PriceScaleModeName | undefined): PriceScaleMode {
  if (mode === "log") return PriceScaleMode.Logarithmic;
  if (mode === "percentage") return PriceScaleMode.Percentage;
  return PriceScaleMode.Normal;
}

/** LWC `Time` values our charts produce are UTCTimestamps; BusinessDay/String also parse. */
function timeToDate(time: Time): Date {
  if (typeof time === "number") return new Date((time as UTCTimestamp) * 1000);
  if (typeof time === "string") return new Date(time);
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

export interface TimezoneFormatters {
  tickMarkFormatter: TickMarkFormatter;
  timeFormatter: TimeFormatterFn<Time>;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Crosshair time label the way Lightweight Charts formats it by default:
 * `dd MMM 'yy   HH:mm` from UTC fields. `applyOptions` skips `undefined`, so
 * clearing a timezone needs this explicit stand-in rather than a hole.
 */
function defaultTimeLabel(time: Time): string {
  const d = timeToDate(time);
  const month = new Date(d.getUTCFullYear(), d.getUTCMonth(), 1).toLocaleString(undefined, { month: "short" });
  return `${pad2(d.getUTCDate())} ${month} '${pad2(d.getUTCFullYear() % 100)}   ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/**
 * Time-axis formatters pinned to an IANA zone.
 *
 * Lightweight Charts has no timezone option: it formats ticks itself. The fix
 * is a tick-mark formatter for the axis and a localization time formatter for
 * the crosshair label, both via `Intl.DateTimeFormat`. A null/empty zone — or
 * one the runtime rejects — returns formatters that reproduce LWC's own
 * defaults, because `chart.applyOptions` ignores `undefined` and cannot un-set
 * a formatter once one was applied.
 */
export function timezoneFormatters(tz: string | null | undefined): TimezoneFormatters {
  const fallback: TimezoneFormatters = {
    tickMarkFormatter: () => null, // null sends LWC back to its default formatter
    timeFormatter: defaultTimeLabel,
  };
  if (!tz) return fallback;
  let perType: Intl.DateTimeFormat[];
  let full: Intl.DateTimeFormat;
  try {
    perType = [
      new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }),
      new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", year: "numeric" }),
      new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "2-digit", month: "short" }),
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }),
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    ];
    full = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return fallback; // not an IANA zone this runtime knows
  }
  return {
    tickMarkFormatter: (time, tickMarkType) => {
      const date = timeToDate(time);
      const fmt = perType[tickMarkType] ?? perType[TickMarkType.DayOfMonth]!;
      return fmt.format(date);
    },
    timeFormatter: (time) => full.format(timeToDate(time)),
  };
}
