import type { IndicatorDef, SeriesResult, SeriesValue } from "./types.js";
import { change, ema, highest, lowest, map2, rma, round, sma, stdev, trueRange } from "./helpers.js";

type Params = Record<string, number | boolean | string>;

export const num = (params: Params, id: string, fallback: number): number => {
  const v = params[id];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
};

export const res = (id: string, name: string, values: SeriesValue[], plots?: Record<string, SeriesValue[]>): SeriesResult => ({
  id,
  name,
  values: round(values),
  ...(plots ? { plots: Object.fromEntries(Object.entries(plots).map(([k, v]) => [k, round(v)])) } : {}),
});

/** Price source by id, matching TV's source selector. */
export function source(data: { close: number[]; open: number[]; high: number[]; low: number[]; hl2?: number[] }, id: string): number[] {
  switch (id) {
    case "open":
      return data.open;
    case "high":
      return data.high;
    case "low":
      return data.low;
    case "hl2":
      return data.high.map((h, i) => (h + data.low[i]!) / 2);
    case "hlc3":
      return data.high.map((h, i) => (h + data.low[i]! + data.close[i]!) / 3);
    case "ohlc4":
      return data.high.map((h, i) => (h + data.low[i]! + data.close[i]! + data.open[i]!) / 4);
    default:
      return data.close;
  }
}

export const srcParam = (def: string) => ({
  id: "source",
  label: "Source",
  type: "source" as const,
  default: def,
});

// --- trend -----------------------------------------------------------------

const smaDef: IndicatorDef = {
  id: "sma",
  name: "Simple Moving Average",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 0,
  params: [
    { id: "length", label: "Length", type: "int", default: 20, min: 1, max: 500 },
    srcParam("close"),
  ],
  compute: (d, p) => res("sma", "SMA", sma(source(d, String(p.source ?? "close")), num(p, "length", 20))),
};

const emaDef: IndicatorDef = {
  id: "ema",
  name: "Exponential Moving Average",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 1,
  params: [
    { id: "length", label: "Length", type: "int", default: 21, min: 1, max: 500 },
    srcParam("close"),
  ],
  compute: (d, p) => res("ema", "EMA", ema(source(d, String(p.source ?? "close")), num(p, "length", 21))),
};

const vwmaDef: IndicatorDef = {
  id: "vwma",
  name: "Volume Weighted Moving Average",
  pane: "overlay",
  family: "volume",
  defaultColorIndex: 2,
  params: [{ id: "length", label: "Length", type: "int", default: 20, min: 1, max: 500 }],
  compute: (d, p) => {
    const n = num(p, "length", 20);
    const pv = d.close.map((c, i) => c * d.volume[i]!);
    const pvSum = sma(pv, n);
    const vSum = sma(d.volume, n);
    return res("vwma", "VWMA", map2(pvSum, vSum, (a, b) => (b === 0 ? a : a / b)));
  },
};

const vwapDef: IndicatorDef = {
  id: "vwap",
  name: "Volume Weighted Average Price",
  pane: "overlay",
  family: "volume",
  defaultColorIndex: 3,
  params: [srcParam("hlc3")],
  compute: (d, p) => {
    const s = source(d, String(p.source ?? "hlc3"));
    let cumPV = 0;
    let cumV = 0;
    const out: SeriesValue[] = s.map((v, i) => {
      cumPV += v * d.volume[i]!;
      cumV += d.volume[i]!;
      return cumV === 0 ? null : cumPV / cumV;
    });
    return res("vwap", "VWAP", out);
  },
};

// --- volatility -------------------------------------------------------------

const bollingerDef: IndicatorDef = {
  id: "bb",
  name: "Bollinger Bands",
  pane: "overlay",
  family: "volatility",
  defaultColorIndex: 4,
  params: [
    { id: "length", label: "Length", type: "int", default: 20, min: 1, max: 500 },
    { id: "mult", label: "StdDev", type: "float", default: 2, min: 0.1, max: 10 },
    srcParam("close"),
  ],
  compute: (d, p) => {
    const len = num(p, "length", 20);
    const mult = num(p, "mult", 2);
    const s = source(d, String(p.source ?? "close"));
    const mid = sma(s, len);
    const sd = stdev(s, len);
    const upper = map2(mid, sd, (m, v) => m + v * mult);
    const lower = map2(mid, sd, (m, v) => m - v * mult);
    return res("bb", "Bollinger Bands", mid, { upper, lower });
  },
};

const atrDef: IndicatorDef = {
  id: "atr",
  name: "Average True Range",
  pane: "separate",
  family: "volatility",
  defaultColorIndex: 5,
  params: [{ id: "length", label: "Length", type: "int", default: 14, min: 1, max: 500 }],
  compute: (d, p) => res("atr", "ATR", rma(trueRange(d), num(p, "length", 14))),
};

const stdevDef: IndicatorDef = {
  id: "stdev",
  name: "Standard Deviation",
  pane: "separate",
  family: "volatility",
  defaultColorIndex: 6,
  params: [
    { id: "length", label: "Length", type: "int", default: 20, min: 1, max: 500 },
    srcParam("close"),
  ],
  compute: (d, p) => res("stdev", "StdDev", stdev(source(d, String(p.source ?? "close")), num(p, "length", 20))),
};

// --- momentum --------------------------------------------------------------

const rsiDef: IndicatorDef = {
  id: "rsi",
  name: "Relative Strength Index",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 7,
  params: [
    { id: "length", label: "Length", type: "int", default: 14, min: 1, max: 500 },
    srcParam("close"),
  ],
  compute: (d, p) => {
    const len = num(p, "length", 14);
    const s = source(d, String(p.source ?? "close"));
    const deltas = change(s, 1).map((v) => v ?? 0);
    const gains = deltas.map((v) => (v > 0 ? v : 0));
    const losses = deltas.map((v) => (v < 0 ? -v : 0));
    const avgGain = rma(gains, len);
    const avgLoss = rma(losses, len);
    const out = map2(avgGain, avgLoss, (g, l) => (l === 0 ? 100 : 100 - 100 / (1 + g / l)));
    return res("rsi", "RSI", out);
  },
};

const macdDef: IndicatorDef = {
  id: "macd",
  name: "MACD",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 8,
  params: [
    { id: "fast", label: "Fast", type: "int", default: 12, min: 1, max: 200 },
    { id: "slow", label: "Slow", type: "int", default: 26, min: 1, max: 400 },
    { id: "signal", label: "Signal", type: "int", default: 9, min: 1, max: 200 },
    srcParam("close"),
  ],
  compute: (d, p) => {
    const s = source(d, String(p.source ?? "close"));
    const fast = ema(s, num(p, "fast", 12));
    const slow = ema(s, num(p, "slow", 26));
    const macd = map2(fast, slow, (a, b) => a - b);
    const signal = ema(macd.map((v) => v ?? 0), num(p, "signal", 9));
    // Signal needs the macd line to be non-null to be meaningful.
    const signalAligned = signal.map((v, i) => (macd[i] === null ? null : v));
    const hist = map2(macd, signalAligned, (a, b) => a - b);
    return res("macd", "MACD", macd, { signal: signalAligned, hist });
  },
};

const stochDef: IndicatorDef = {
  id: "stoch",
  name: "Stochastic",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 9,
  params: [
    { id: "k", label: "%K", type: "int", default: 14, min: 1, max: 500 },
    { id: "d", label: "%D", type: "int", default: 3, min: 1, max: 500 },
    { id: "smooth", label: "Smoothing", type: "int", default: 3, min: 1, max: 500 },
  ],
  compute: (d, p) => {
    const kLen = num(p, "k", 14);
    const dLen = num(p, "d", 3);
    const smooth = num(p, "smooth", 3);
    const hh = highest(d.high, kLen);
    const ll = lowest(d.low, kLen);
    // raw %K = 100 * (close - lowest) / (highest - lowest)
    const k: SeriesValue[] = hh.map((h, i) => {
      const l = ll[i] ?? null;
      if (h === null || l === null || h === l) return null;
      return (100 * (d.close[i]! - l)) / (h - l);
    });
    const kSmooth = k.map((v, i) => {
      if (v === null) return null;
      // simple smoothing over `smooth` non-null tail
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - smooth + 1); j <= i; j++) {
        const sv = k[j];
        if (typeof sv === "number") {
          sum += sv;
          n++;
        }
      }
      return n === 0 ? null : sum / n;
    });
    const dLine: SeriesValue[] = kSmooth.map((_, i) => {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - dLen + 1); j <= i; j++) {
        const sv = kSmooth[j];
        if (typeof sv === "number") {
          sum += sv;
          n++;
        }
      }
      return n === 0 ? null : sum / n;
    });
    return res("stoch", "Stochastic", kSmooth, { d: dLine });
  },
};

const cmoDef: IndicatorDef = {
  id: "cmo",
  name: "Chande Momentum Oscillator",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 10,
  params: [
    { id: "length", label: "Length", type: "int", default: 14, min: 1, max: 500 },
    srcParam("close"),
  ],
  compute: (d, p) => {
    const len = num(p, "length", 14);
    const s = source(d, String(p.source ?? "close"));
    const diff = change(s, 1);
    const out: SeriesValue[] = diff.map((v, i) => {
      if (v === null) return null;
      let up = 0;
      let down = 0;
      let n = 0;
      for (let j = Math.max(1, i - len + 1); j <= i; j++) {
        const dv = diff[j] ?? null;
        if (dv === null) continue;
        if (dv > 0) up += dv;
        else down -= dv;
        n++;
      }
      if (n === 0) return null;
      const denom = up + down;
      return denom === 0 ? 0 : (100 * (up - down)) / denom;
    });
    return res("cmo", "CMO", out);
  },
};

const willrDef: IndicatorDef = {
  id: "willr",
  name: "Williams %R",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 11,
  params: [{ id: "length", label: "Length", type: "int", default: 14, min: 1, max: 500 }],
  compute: (d, p) => {
    const len = num(p, "length", 14);
    const hh = highest(d.high, len);
    const ll = lowest(d.low, len);
    const out = hh.map((h, i) => {
      const l = ll[i] ?? null;
      if (h === null || l === null || h === l) return null;
      return (-100 * (h - d.close[i]!)) / (h - l);
    });
    return res("willr", "Williams %R", out);
  },
};

// --- volume ----------------------------------------------------------------

const obvDef: IndicatorDef = {
  id: "obv",
  name: "On Balance Volume",
  pane: "separate",
  family: "volume",
  defaultColorIndex: 12,
  params: [],
  compute: (d) => {
    let total = 0;
    const out: SeriesValue[] = d.close.map((c, i) => {
      if (i === 0) return 0;
      const prev = d.close[i - 1]!;
      if (c > prev) total += d.volume[i]!;
      else if (c < prev) total -= d.volume[i]!;
      return total;
    });
    return res("obv", "OBV", out);
  },
};

const volumeDef: IndicatorDef = {
  id: "volume",
  name: "Volume",
  pane: "overlay",
  family: "volume",
  defaultColorIndex: 13,
  params: [],
  compute: (d) => res("volume", "Volume", d.volume.map((v) => v)),
};

/** Everything shipped with EzyView. */
export const CATALOG: IndicatorDef[] = [
  smaDef,
  emaDef,
  vwmaDef,
  vwapDef,
  bollingerDef,
  atrDef,
  stdevDef,
  rsiDef,
  macdDef,
  stochDef,
  cmoDef,
  willrDef,
  obvDef,
  volumeDef,
];
