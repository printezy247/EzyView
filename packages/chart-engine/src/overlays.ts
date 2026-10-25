import type { Candle } from "@ezyview/data-adapters";

export type CompareMode = "percent" | "ratio" | "spread";

/** One symbol overlaid on the main pane. */
export interface CompareSeries {
  id: string;
  symbol: string;
  color: string;
  mode: CompareMode;
  /** Full history for the compared symbol; aligned to the primary on rebuild. */
  data: readonly Candle[];
}

export interface AlignedPoint {
  time: number;
  value: number;
}

/**
 * Align a secondary series to the primary by exact timestamp and normalise it:
 *
 * - `percent` — percent change from the first common close (0 = flat);
 * - `ratio`   — secondary close ÷ primary close;
 * - `spread`  — secondary close − primary close.
 *
 * Bars the secondary does not have are skipped rather than interpolated: a
 * synthetic point would be a number the market never printed.
 */
export function alignCompare(
  primary: readonly Candle[],
  secondary: readonly Candle[],
  mode: CompareMode,
): AlignedPoint[] {
  if (primary.length === 0 || secondary.length === 0) return [];
  const byTime = new Map<number, number>();
  for (const candle of secondary) byTime.set(candle.time, candle.close);
  let baseSecondary: number | null = null;
  const out: AlignedPoint[] = [];
  for (const candle of primary) {
    const other = byTime.get(candle.time);
    if (other === undefined || !Number.isFinite(other)) continue;
    if (mode === "percent") {
      baseSecondary ??= other;
      const base = baseSecondary ?? other;
      if (!(base > 0)) continue;
      out.push({ time: candle.time, value: ((other - base) / base) * 100 });
      continue;
    }
    if (mode === "ratio") {
      if (!(candle.close > 0)) continue;
      out.push({ time: candle.time, value: other / candle.close });
      continue;
    }
    out.push({ time: candle.time, value: other - candle.close });
  }
  return out;
}
