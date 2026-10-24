import type { Drawing, DrawingStyle, FibLevelStyle, TimeframeUnit } from "./types.js";
import { FIB_RETRACEMENT_LEVELS } from "./fib.js";

/**
 * Timeframe visibility for drawings.
 *
 * The chart resolution names its own bucket ("15m" is minutes, "4h" is hours,
 * "1M" is months), so the filter needs no table and a new resolution string
 * keeps working. Absent visibility means the drawing is visible everywhere; a
 * bucket that is explicitly `false` hides it there.
 */

export const TIMEFRAME_UNITS: readonly { id: TimeframeUnit; label: string }[] = [
  { id: "seconds", label: "Seconds" },
  { id: "minutes", label: "Minutes" },
  { id: "hours", label: "Hours" },
  { id: "days", label: "Days" },
  { id: "weeks", label: "Weeks" },
  { id: "months", label: "Months" },
];

export function timeframeUnit(resolution: string): TimeframeUnit {
  switch (resolution.at(-1)) {
    case "s":
    case "t":
      return "seconds";
    case "m":
      return "minutes";
    case "h":
      return "hours";
    case "D":
      return "days";
    case "W":
      return "weeks";
    case "M":
      return "months";
    default:
      return "minutes";
  }
}

/** False only when the drawing explicitly excludes the resolution's bucket. */
export function visibleOnResolution(drawing: Drawing, resolution: string): boolean {
  if (!drawing.visibility) return true;
  return drawing.visibility[timeframeUnit(resolution)] !== false;
}

/** Default Fib level rows for the settings grid and the renderer. */
export function fibLevelStyles(style: DrawingStyle): FibLevelStyle[] {
  if (style.fibLevels && style.fibLevels.length > 0) return style.fibLevels;
  return FIB_RETRACEMENT_LEVELS.map((level) => ({
    ratio: level.ratio,
    label: level.label,
    enabled: true,
  }));
}
