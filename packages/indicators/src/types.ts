/**
 * EzyView indicator library.
 *
 * Pure, dependency-free computations over OHLCV series. Every indicator returns
 * a `SeriesResult` aligned 1:1 with the input candles (leading nulls where the
 * warm-up period has not yet produced a value).
 */

export type SeriesValue = number | null;

export interface SeriesResult {
  /** Stable id, e.g. "rsi". */
  id: string;
  /** Display name, e.g. "Relative Strength Index". */
  name: string;
  /** One aligned value per input candle. */
  values: SeriesValue[];
  /** Optional per-index plot labels (histograms, bands). */
  plots?: Record<string, SeriesValue[]>;
}

export interface IndicatorInput {
  values: number[];
}

export interface IndicatorParam {
  id: string;
  label: string;
  type: "int" | "float" | "source" | "bool" | "color";
  default: number | string | boolean;
  min?: number;
  max?: number;
}

export interface IndicatorDef {
  id: string;
  name: string;
  /** Where the output renders: overlay on price, or its own pane. */
  pane: "overlay" | "separate";
  family: "trend" | "momentum" | "volatility" | "volume" | "overlap" | "other";
  params: IndicatorParam[];
  /** Compute the output. `inputs` provides OHLCV slices keyed open/high/low/close/volume. */
  compute(inputs: Record<"open" | "high" | "low" | "close" | "volume", number[]>, params: Record<string, number | string | boolean>): SeriesResult;
}
