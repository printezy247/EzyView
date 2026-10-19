import type { OHLCV } from "./helpers.js";

export type SeriesValue = number | null;

export interface SeriesResult {
  /** Stable id, e.g. "rsi". */
  id: string;
  /** Display name, e.g. "Relative Strength Index". */
  name: string;
  /** One aligned value per input candle; leading nulls are warm-up. */
  values: SeriesValue[];
  /** Extra aligned plots (bands, histogram, signal line). */
  plots?: Record<string, SeriesValue[]>;
}

export interface IndicatorParam {
  id: string;
  label: string;
  type: "int" | "float" | "source" | "bool";
  default: number | boolean | string;
  min?: number;
  max?: number;
}

export type PaneKind = "overlay" | "separate";
export type IndicatorFamily = "trend" | "momentum" | "volatility" | "volume" | "overlap" | "other";

export interface IndicatorDef {
  id: string;
  name: string;
  pane: PaneKind;
  family: IndicatorFamily;
  /** Default palette index; the app cycles colors per series. */
  defaultColorIndex: number;
  params: IndicatorParam[];
  compute(data: OHLCV, params: Record<string, number | boolean | string>): SeriesResult;
}

export type { OHLCV } from "./helpers.js";
