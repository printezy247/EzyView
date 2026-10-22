import type { IndicatorDef, SeriesValue } from "./types.js";
import type { OHLCV } from "./helpers.js";
import {
  alma,
  change,
  cumSum,
  ema,
  fillForward,
  highest,
  hma,
  lowest,
  map2,
  rma,
  sma,
  stdev,
  sumRolling,
  trueRange,
  zlema,
} from "./helpers.js";
import { num, res, source, srcParam } from "./catalog.js";

const lengthParam = (def: number, label = "Length", id = "length") => ({
  id,
  label,
  type: "int" as const,
  default: def,
  min: 1,
  max: 500,
});

const hl2 = (d: OHLCV): number[] => d.high.map((h, i) => (h + d.low[i]!) / 2);
const hlc3 = (d: OHLCV): number[] => d.high.map((h, i) => (h + d.low[i]! + d.close[i]!) / 3);
const typicalVolume = (d: OHLCV): number[] => hlc3(d).map((tp, i) => tp * d.volume[i]!);

/** Rolling mean absolute deviation, used by CCI. */
function meanDeviation(values: number[], period: number): SeriesValue[] {
  const center = sma(values, period);
  const out: SeriesValue[] = Array.from({ length: values.length }, () => null);
  for (let i = period - 1; i < values.length; i++) {
    const c = center[i]!;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += Math.abs(values[j]! - c);
    out[i] = sum / period;
  }
  return out;
}

// --- trend -----------------------------------------------------------------

const hmaDef: IndicatorDef = {
  id: "hma",
  name: "Hull Moving Average",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 14,
  params: [lengthParam(16), srcParam("close")],
  compute: (d, p) => res("hma", "HMA", hma(source(d, String(p.source ?? "close")), num(p, "length", 16))),
};

const almaDef: IndicatorDef = {
  id: "alma",
  name: "Arnaud Legoux Moving Average",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 15,
  params: [
    lengthParam(9),
    { id: "offset", label: "Offset", type: "float", default: 0.85, min: 0, max: 1 },
    { id: "sigma", label: "Sigma", type: "float", default: 6, min: 1, max: 20 },
  ],
  compute: (d, p) =>
    res(
      "alma",
      "ALMA",
      alma(source(d, String(p.source ?? "close")), num(p, "length", 9), num(p, "offset", 0.85), num(p, "sigma", 6)),
    ),
};

const zlemaDef: IndicatorDef = {
  id: "zlema",
  name: "Zero Lag EMA",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 16,
  params: [lengthParam(21), srcParam("close")],
  compute: (d, p) => res("zlema", "ZLEMA", zlema(source(d, String(p.source ?? "close")), num(p, "length", 21))),
};

const demaDef: IndicatorDef = {
  id: "dema",
  name: "Double EMA",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 17,
  params: [lengthParam(10), srcParam("close")],
  compute: (d, p) => {
    const s = source(d, String(p.source ?? "close"));
    const n = num(p, "length", 10);
    const e1 = ema(s, n);
    const e2 = ema(fillForward(e1), n);
    return res("dema", "DEMA", map2(e1, e2, (a, b) => 2 * a - b));
  },
};

const temaDef: IndicatorDef = {
  id: "tema",
  name: "Triple EMA",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 18,
  params: [lengthParam(10), srcParam("close")],
  compute: (d, p) => {
    const s = source(d, String(p.source ?? "close"));
    const n = num(p, "length", 10);
    const e1 = ema(s, n);
    const e2 = ema(fillForward(e1), n);
    const e3 = ema(fillForward(e2), n);
    return res("tema", "TEMA", map2(map2(e1, e2, (a, b) => 3 * a - 3 * b), e3, (a, b) => a + b));
  },
};

const kamaDef: IndicatorDef = {
  id: "kama",
  name: "Kaufman Adaptive Moving Average",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 19,
  params: [lengthParam(10, "ER Length"), { id: "fast", label: "Fast SC", type: "int", default: 2, min: 1, max: 50 }],
  compute: (d, p) => {
    const n = num(p, "length", 10);
    const fastSc = 2 / (num(p, "fast", 2) + 1);
    const slowSc = 2 / (30 + 1);
    const close = d.close;
    const out: SeriesValue[] = Array.from({ length: close.length }, () => null);
    let prev = close[0] ?? 0;
    for (let i = n; i < close.length; i++) {
      const changeAbs = Math.abs(close[i]! - close[i - n]!);
      let volatility = 0;
      for (let j = i - n + 1; j <= i; j++) volatility += Math.abs(close[j]! - close[j - 1]!);
      const er = volatility === 0 ? 0 : changeAbs / volatility;
      const sc = (er * (fastSc - slowSc) + slowSc) ** 2;
      prev = prev + sc * (close[i]! - prev);
      out[i] = prev;
    }
    return res("kama", "KAMA", out);
  },
};

const linregDef: IndicatorDef = {
  id: "linreg",
  name: "Linear Regression Curve",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 20,
  params: [lengthParam(14), srcParam("close")],
  compute: (d, p) => {
    const s = source(d, String(p.source ?? "close"));
    const n = num(p, "length", 14);
    // Least-squares line fitted over the trailing window. The window is walked
    // newest-first, so x=0 is the current bar and the curve plots the fitted
    // value AT the current bar (the intercept), not an extrapolated endpoint.
    const sumX = (n * (n - 1)) / 2;
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
    const denom = n * sumXX - sumX * sumX;
    const out: SeriesValue[] = Array.from({ length: s.length }, () => null);
    for (let i = n - 1; i < s.length; i++) {
      let sumXY = 0;
      let sumY = 0;
      for (let j = 0; j < n; j++) {
        const y = s[i - j]!;
        sumXY += j * y;
        sumY += y;
      }
      const m = (n * sumXY - sumX * sumY) / denom;
      const b = (sumY - m * sumX) / n;
      // x=0 is the current bar, so the intercept is the fitted value here.
      out[i] = b;
    }
    return res("linreg", "LinReg", out);
  },
};

const mcginleyDef: IndicatorDef = {
  id: "mcginley",
  name: "McGinley Dynamic",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 21,
  params: [lengthParam(14), srcParam("close")],
  compute: (d, p) => {
    const s = source(d, String(p.source ?? "close"));
    const n = num(p, "length", 14);
    const out: SeriesValue[] = Array.from({ length: s.length }, () => null);
    let md = s[0] ?? 0;
    for (let i = 1; i < s.length; i++) {
      const c = s[i]!;
      const ratio = md === 0 ? 1 : c / md;
      md = md + (c - md) / Math.max(1, n * ratio ** 4);
      out[i] = md;
    }
    return res("mcginley", "McGinley", out);
  },
};

const supertrendDef: IndicatorDef = {
  id: "supertrend",
  name: "SuperTrend",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 22,
  params: [
    { id: "length", label: "ATR Length", type: "int", default: 10, min: 1, max: 200 },
    { id: "factor", label: "Factor", type: "float", default: 3, min: 0.1, max: 20 },
  ],
  compute: (d, p) => {
    const n = num(p, "length", 10);
    const f = num(p, "factor", 3);
    const atr = fillForward(rma(trueRange(d), n), d.close[0] ?? 0);
    const mid = hl2(d);
    const out: SeriesValue[] = Array.from({ length: d.close.length }, () => null);
    let dir = 1;
    let upper = 0;
    let lower = 0;
    for (let i = 0; i < d.close.length; i++) {
      const m = mid[i]!;
      const a = atr[i]!;
      let bu = m + f * a;
      let bl = m - f * a;
      const prevClose = d.close[i - 1];
      if (prevClose !== undefined) {
        bu = prevClose > upper ? bu : Math.min(bu, upper);
        bl = prevClose < lower ? bl : Math.max(bl, lower);
      }
      if (i === 0) {
        upper = bu;
        lower = bl;
      }
      if (prevClose !== undefined && prevClose > upper) dir = 1;
      else if (prevClose !== undefined && prevClose < lower) dir = -1;
      // Otherwise the trend persists: `dir` keeps its previous value.
      upper = bu;
      lower = bl;
      out[i] = dir === 1 ? lower : upper;
    }
    return res("supertrend", "SuperTrend", out);
  },
};

const ichimokuDef: IndicatorDef = {
  id: "ichimoku",
  name: "Ichimoku Cloud",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 23,
  params: [
    { id: "tenkan", label: "Conversion", type: "int", default: 9, min: 1, max: 200 },
    { id: "kijun", label: "Base", type: "int", default: 26, min: 1, max: 400 },
    { id: "senkou", label: "Leading Span B", type: "int", default: 52, min: 1, max: 600 },
    { id: "shift", label: "Shift", type: "int", default: 26, min: 1, max: 200 },
  ],
  compute: (d, p) => {
    const tenkanLen = num(p, "tenkan", 9);
    const kijunLen = num(p, "kijun", 26);
    const senkouLen = num(p, "senkou", 52);
    const shift = num(p, "shift", 26);
    const mid = (period: number): SeriesValue[] =>
      map2(highest(d.high, period), lowest(d.low, period), (h, l) => (h + l) / 2);
    const conv = mid(tenkanLen);
    const base = mid(kijunLen);
    const spanB = mid(senkouLen);
    const spanA = conv.map((c, i) => {
      const b = base[i] ?? null;
      return c === null || b === null ? null : (c + b) / 2;
    });
    // Leading spans are plotted `shift` bars ahead; shift backwards so the cloud
    // sits under the current bar like TradingView draws it.
    const back = <T extends SeriesValue>(values: T[]): SeriesValue[] =>
      values.map((v, i) => (i < shift ? null : (values[i - shift] ?? null)));
    return res("ichimoku", "Ichimoku", conv, {
      base,
      spanA: back(spanA),
      spanB: back(spanB),
    });
  },
};

// --- momentum --------------------------------------------------------------

const stochRsiDef: IndicatorDef = {
  id: "stoch_rsi",
  name: "Stochastic RSI",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 24,
  params: [lengthParam(14, "RSI Length", "length"), lengthParam(14, "Stoch Length", "length1"), lengthParam(3, "Smoothing", "length2")],
  compute: (d, p) => {
    const rsiLen = num(p, "length", 14);
    const stochLen = num(p, "length1", 14);
    const smooth = num(p, "length2", 3);
    const s = d.close;
    const deltas = change(s, 1).map((v) => v ?? 0);
    const gains = deltas.map((v) => (v > 0 ? v : 0));
    const losses = deltas.map((v) => (v < 0 ? -v : 0));
    const rsi = map2(rma(gains, rsiLen), rma(losses, rsiLen), (g, l) => (l === 0 ? 100 : 100 - 100 / (1 + g / l)));
    const hh = highest(fillForward(rsi), stochLen);
    const ll = lowest(fillForward(rsi), stochLen);
    const rawK = hh.map((h, i) => {
      const l = ll[i] ?? null;
      const r = rsi[i] ?? null;
      if (h === null || l === null || r === null || h === l) return null;
      return (100 * (r - l)) / (h - l);
    });
    const smoothed = sma(fillForward(rawK), smooth).map((v, i) => (rawK[i] === null && i < smooth ? null : v));
    return res("stoch_rsi", "Stochastic RSI", smoothed);
  },
};

const cciDef: IndicatorDef = {
  id: "cci",
  name: "Commodity Channel Index",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 25,
  params: [lengthParam(20)],
  compute: (d, p) => {
    const n = num(p, "length", 20);
    const tp = hlc3(d);
    const center = sma(tp, n);
    const dev = meanDeviation(tp, n);
    return res(
      "cci",
      "CCI",
      tp.map((t, i) => {
        const c = center[i] ?? null;
        const m = dev[i] ?? null;
        if (c === null || m === null || m === 0) return null;
        return (t - c) / (0.015 * m);
      }),
    );
  },
};

const mfiDef: IndicatorDef = {
  id: "mfi",
  name: "Money Flow Index",
  pane: "separate",
  family: "volume",
  defaultColorIndex: 26,
  params: [lengthParam(14)],
  compute: (d, p) => {
    const n = num(p, "length", 14);
    const tp = hlc3(d);
    const pos: number[] = [];
    const neg: number[] = [];
    for (let i = 0; i < tp.length; i++) {
      const prev = tp[i - 1];
      const flow = tp[i]! * d.volume[i]!;
      if (prev === undefined) {
        pos.push(0);
        neg.push(0);
      } else if (tp[i]! > prev) {
        pos.push(flow);
        neg.push(0);
      } else {
        pos.push(0);
        neg.push(flow);
      }
    }
    const up = sumRolling(pos, n);
    const down = sumRolling(neg, n);
    return res(
      "mfi",
      "MFI",
      map2(up, down, (u, dl) => (dl === 0 ? 100 : 100 - 100 / (1 + u / dl))),
    );
  },
};

const rocDef: IndicatorDef = {
  id: "roc",
  name: "Rate of Change",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 27,
  params: [lengthParam(12)],
  compute: (d, p) => {
    const n = num(p, "length", 12);
    const out = d.close.map((c, i) => {
      const prev = d.close[i - n];
      return prev === undefined || prev === 0 ? null : ((c - prev) / prev) * 100;
    });
    return res("roc", "ROC", out);
  },
};

const tsiDef: IndicatorDef = {
  id: "tsi",
  name: "True Strength Index",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 28,
  params: [lengthParam(25, "Long", "length"), lengthParam(13, "Short", "length1"), lengthParam(7, "Signal", "length2")],
  compute: (d, p) => {
    const longLen = num(p, "length", 25);
    const shortLen = num(p, "length1", 13);
    const sigLen = num(p, "length2", 7);
    const momentum = change(d.close, 1).map((v) => v ?? 0);
    const smooth1 = ema(momentum, longLen);
    const smooth2 = ema(fillForward(smooth1), shortLen);
    const abs1 = ema(momentum.map((v) => Math.abs(v)), longLen);
    const abs2 = ema(fillForward(abs1), shortLen);
    const tsi = map2(smooth2, abs2, (a, b) => (b === 0 ? 0 : (100 * a) / b));
    const signal = sma(fillForward(tsi), sigLen).map((v, i) => (tsi[i] === null && i < sigLen ? null : v));
    return res("tsi", "TSI", tsi, { signal });
  },
};

const ultimateDef: IndicatorDef = {
  id: "uo",
  name: "Ultimate Oscillator",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 29,
  params: [
    { id: "fast", label: "Fast", type: "int", default: 7, min: 1, max: 100 },
    { id: "mid", label: "Medium", type: "int", default: 14, min: 1, max: 200 },
    { id: "slow", label: "Slow", type: "int", default: 28, min: 1, max: 400 },
  ],
  compute: (d, p) => {
    const f = num(p, "fast", 7);
    const m = num(p, "mid", 14);
    const s = num(p, "slow", 28);
    const tr = trueRange(d);
    const bp: number[] = d.close.map((c, i) => {
      const prevClose = d.close[i - 1] ?? c;
      return c - Math.min(d.low[i]!, prevClose);
    });
    const avg = (period: number): SeriesValue[] => {
      let bpSum = 0;
      let trSum = 0;
      const out: SeriesValue[] = Array.from({ length: d.close.length }, () => null);
      for (let i = 0; i < d.close.length; i++) {
        bpSum += bp[i]!;
        trSum += tr[i]!;
        if (i >= period) {
          bpSum -= bp[i - period]!;
          trSum -= tr[i - period]!;
        }
        if (i >= period - 1) out[i] = trSum === 0 ? 0 : bpSum / trSum;
      }
      return out;
    };
    const a1 = avg(f);
    const a2 = avg(m);
    const a3 = avg(s);
    const out = a1.map((v, i) => {
      const b = a2[i] ?? null;
      const c = a3[i] ?? null;
      if (v === null || b === null || c === null) return null;
      return (100 * (4 * v + 2 * b + c)) / 7;
    });
    return res("uo", "Ultimate Oscillator", out);
  },
};

const awesomeDef: IndicatorDef = {
  id: "ao",
  name: "Awesome Oscillator",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 30,
  params: [
    { id: "fast", label: "Fast Period", type: "int", default: 5, min: 1, max: 200 },
    { id: "slow", label: "Slow Period", type: "int", default: 34, min: 1, max: 400 },
  ],
  compute: (d, p) => {
    const fast = sma(hl2(d), num(p, "fast", 5));
    const slow = sma(hl2(d), num(p, "slow", 34));
    return res("ao", "Awesome Oscillator", map2(fast, slow, (a, b) => a - b));
  },
};

const bullsDef: IndicatorDef = {
  id: "bulls_power",
  name: "Bulls Power",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 31,
  params: [lengthParam(13)],
  compute: (d, p) => {
    const e = ema(d.close, num(p, "length", 13));
    return res("bulls_power", "Bulls Power", d.high.map((h, i) => (e[i] === null ? null : h - e[i]!)));
  },
};

const bearsDef: IndicatorDef = {
  id: "bears_power",
  name: "Bears Power",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 32,
  params: [lengthParam(13)],
  compute: (d, p) => {
    const e = ema(d.close, num(p, "length", 13));
    return res("bears_power", "Bears Power", d.low.map((l, i) => (e[i] === null ? null : l - e[i]!)));
  },
};

const kstDef: IndicatorDef = {
  id: "kst",
  name: "Know Sure Thing",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 33,
  params: [],
  compute: (d) => {
    const rocOf = (n: number): SeriesValue[] =>
      d.close.map((c, i) => {
        const prev = d.close[i - n];
        return prev === undefined || prev === 0 ? null : ((c - prev) / prev) * 100;
      });
    const term = (n: number, smooth: number): SeriesValue[] => {
      const r = rocOf(n);
      return sma(fillForward(r), smooth).map((v, i) => (r[i] === null && i < smooth ? null : v));
    };
    const a = term(10, 10);
    const b = term(15, 10);
    const c = term(20, 10);
    const e = term(30, 15);
    const kst = a.map((v, i) => {
      const parts = [v, b[i], c[i], e[i]];
      if (parts.some((x) => x === null || x === undefined)) return null;
      return (parts[0]! + 2 * parts[1]! + 3 * parts[2]! + 4 * parts[3]!) / 10;
    });
    const signal = sma(fillForward(kst), 9).map((v, i) => (kst[i] === null && i < 9 ? null : v));
    return res("kst", "KST", kst, { signal });
  },
};

const ppoDef: IndicatorDef = {
  id: "ppo",
  name: "Percentage Price Oscillator",
  pane: "separate",
  family: "momentum",
  defaultColorIndex: 34,
  params: [
    { id: "fast", label: "Fast", type: "int", default: 12, min: 1, max: 200 },
    { id: "slow", label: "Slow", type: "int", default: 26, min: 1, max: 400 },
    { id: "signal", label: "Signal", type: "int", default: 9, min: 1, max: 200 },
  ],
  compute: (d, p) => {
    const fast = ema(d.close, num(p, "fast", 12));
    const slow = ema(d.close, num(p, "slow", 26));
    const ppo = map2(fast, slow, (a, b) => (b === 0 ? 0 : ((a - b) / b) * 100));
    const signal = ema(ppo.map((v) => v ?? 0), num(p, "signal", 9)).map((v, i) => (ppo[i] === null ? null : v));
    const hist = map2(ppo, signal, (a, b) => a - b);
    return res("ppo", "PPO", ppo, { signal, hist });
  },
};

const pvoDef: IndicatorDef = {
  id: "pvo",
  name: "Percentage Volume Oscillator",
  pane: "separate",
  family: "volume",
  defaultColorIndex: 35,
  params: [
    { id: "fast", label: "Fast", type: "int", default: 12, min: 1, max: 200 },
    { id: "slow", label: "Slow", type: "int", default: 26, min: 1, max: 400 },
    { id: "signal", label: "Signal", type: "int", default: 9, min: 1, max: 200 },
  ],
  compute: (d, p) => {
    const fast = ema(d.volume, num(p, "fast", 12));
    const slow = ema(d.volume, num(p, "slow", 26));
    const pvo = map2(fast, slow, (a, b) => (b === 0 ? 0 : ((a - b) / b) * 100));
    const signal = ema(pvo.map((v) => v ?? 0), num(p, "signal", 9)).map((v, i) => (pvo[i] === null ? null : v));
    const hist = map2(pvo, signal, (a, b) => a - b);
    return res("pvo", "PVO", pvo, { signal, hist });
  },
};

// --- volatility ------------------------------------------------------------

const keltnerDef: IndicatorDef = {
  id: "kc",
  name: "Keltner Channels",
  pane: "overlay",
  family: "volatility",
  defaultColorIndex: 36,
  params: [
    lengthParam(20),
    { id: "mult", label: "Multiplier", type: "float", default: 2, min: 0.1, max: 20 },
    { id: "atrLength", label: "ATR Length", type: "int", default: 10, min: 1, max: 200 },
  ],
  compute: (d, p) => {
    const n = num(p, "length", 20);
    const mult = num(p, "mult", 2);
    const atrLen = num(p, "atrLength", 10);
    const middle = ema(d.close, n);
    const atr = rma(trueRange(d), atrLen);
    const upper = map2(middle, atr, (m, a) => m + a * mult);
    const lower = map2(middle, atr, (m, a) => m - a * mult);
    return res("kc", "Keltner Channels", middle, { upper, lower });
  },
};

const donchianDef: IndicatorDef = {
  id: "donchian",
  name: "Donchian Channel",
  pane: "overlay",
  family: "volatility",
  defaultColorIndex: 37,
  params: [lengthParam(20)],
  compute: (d, p) => {
    const n = num(p, "length", 20);
    const upper = highest(d.high, n);
    const lower = lowest(d.low, n);
    const middle = map2(upper, lower, (h, l) => (h + l) / 2);
    return res("donchian", "Donchian Channel", middle, { upper, lower });
  },
};

const bbwidthDef: IndicatorDef = {
  id: "bbwidth",
  name: "Bollinger BandWidth",
  pane: "separate",
  family: "volatility",
  defaultColorIndex: 38,
  params: [lengthParam(20), { id: "mult", label: "StdDev", type: "float", default: 2, min: 0.1, max: 10 }],
  compute: (d, p) => {
    const n = num(p, "length", 20);
    const mult = num(p, "mult", 2);
    const mid = sma(d.close, n);
    const sd = stdev(d.close, n);
    const out = map2(mid, sd, (m, s) => (m === 0 ? 0 : ((2 * s * mult) / m) * 100));
    return res("bbwidth", "BB Width", out);
  },
};

const natrDef: IndicatorDef = {
  id: "natr",
  name: "Normalized ATR",
  pane: "separate",
  family: "volatility",
  defaultColorIndex: 39,
  params: [lengthParam(14)],
  compute: (d, p) => {
    const atr = rma(trueRange(d), num(p, "length", 14));
    return res(
      "natr",
      "NATR",
      atr.map((a, i) => {
        const c = d.close[i]!;
        return a === null || c === 0 ? null : (a / c) * 100;
      }),
    );
  },
};

const priceSourceDef: IndicatorDef = {
  id: "price_source",
  name: "Price Source",
  pane: "overlay",
  family: "other",
  defaultColorIndex: 40,
  params: [srcParam("hl2")],
  compute: (d, p) => res("price_source", "Price Source", source(d, String(p.source ?? "hl2"))),
};

const medianPriceDef: IndicatorDef = {
  id: "median_price",
  name: "Median Price",
  pane: "overlay",
  family: "other",
  defaultColorIndex: 41,
  params: [],
  compute: (d) => res("median_price", "Median Price", hl2(d)),
};

const typicalPriceDef: IndicatorDef = {
  id: "typical_price",
  name: "Typical Price",
  pane: "overlay",
  family: "other",
  defaultColorIndex: 42,
  params: [],
  compute: (d) => res("typical_price", "Typical Price", hlc3(d)),
};

const weightedCloseDef: IndicatorDef = {
  id: "weighted_close",
  name: "Weighted Close",
  pane: "overlay",
  family: "other",
  defaultColorIndex: 43,
  params: [],
  compute: (d) =>
    res(
      "weighted_close",
      "Weighted Close",
      d.high.map((h, i) => (h + d.low[i]! + 2 * d.close[i]!) / 4),
    ),
};

const psarDef: IndicatorDef = {
  id: "psar",
  name: "Parabolic SAR",
  pane: "overlay",
  family: "trend",
  defaultColorIndex: 44,
  params: [
    { id: "start", label: "Start", type: "float", default: 0.02, min: 0.001, max: 0.5 },
    { id: "inc", label: "Increment", type: "float", default: 0.02, min: 0.001, max: 0.5 },
    { id: "max", label: "Max", type: "float", default: 0.2, min: 0.01, max: 1 },
  ],
  compute: (d, p) => {
    const start = num(p, "start", 0.02);
    const inc = num(p, "inc", 0.02);
    const maxAf = num(p, "max", 0.2);
    const out: SeriesValue[] = Array.from({ length: d.close.length }, () => null);
    if (d.close.length < 2) return res("psar", "PSAR", out);
    let bull = d.close[1]! >= d.close[0]!;
    let af = start;
    let ep = bull ? d.high[1]! : d.low[1]!;
    let sar = bull ? d.low[0]! : d.high[0]!;
    for (let i = 1; i < d.close.length; i++) {
      sar = sar + af * (ep - sar);
      const prevLow = d.low[i - 1]!;
      const prevHigh = d.high[i - 1]!;
      if (bull) {
        sar = Math.min(sar, prevLow, i > 1 ? d.low[i - 2]! : prevLow);
        if (d.low[i]! < sar) {
          bull = false;
          sar = ep;
          ep = d.low[i]!;
          af = start;
        }
      } else {
        sar = Math.max(sar, prevHigh, i > 1 ? d.high[i - 2]! : prevHigh);
        if (d.high[i]! > sar) {
          bull = true;
          sar = ep;
          ep = d.high[i]!;
          af = start;
        }
      }
      if (bull && d.high[i]! > ep) {
        ep = d.high[i]!;
        af = Math.min(af + inc, maxAf);
      } else if (!bull && d.low[i]! < ep) {
        ep = d.low[i]!;
        af = Math.min(af + inc, maxAf);
      }
      out[i] = sar;
    }
    return res("psar", "PSAR", out);
  },
};

// --- volume ----------------------------------------------------------------

const adLineDef: IndicatorDef = {
  id: "ad_line",
  name: "A/D Line",
  pane: "separate",
  family: "volume",
  defaultColorIndex: 45,
  params: [],
  compute: (d) => {
    const mfm: number[] = d.close.map((c, i) => {
      const h = d.high[i]!;
      const l = d.low[i]!;
      return h === l ? 0 : ((c - l) - (h - c)) / (h - l);
    });
    return res(
      "ad_line",
      "A/D Line",
      cumSum(mfm.map((m, i) => m * d.volume[i]!)),
    );
  },
};

const adOscDef: IndicatorDef = {
  id: "adosc",
  name: "A/D Oscillator",
  pane: "separate",
  family: "volume",
  defaultColorIndex: 46,
  params: [
    { id: "fast", label: "Fast", type: "int", default: 3, min: 1, max: 100 },
    { id: "slow", label: "Slow", type: "int", default: 10, min: 1, max: 200 },
  ],
  compute: (d, p) => {
    const mfv: number[] = d.close.map((c, i) => {
      const h = d.high[i]!;
      const l = d.low[i]!;
      const mfm = h === l ? 0 : ((c - l) - (h - c)) / (h - l);
      return mfm * d.volume[i]!;
    });
    const fast = ema(mfv, num(p, "fast", 3));
    const slow = ema(mfv, num(p, "slow", 10));
    return res("adosc", "A/D Oscillator", map2(fast, slow, (a, b) => a - b));
  },
};

const cmfDef: IndicatorDef = {
  id: "cmf",
  name: "Chaikin Money Flow",
  pane: "separate",
  family: "volume",
  defaultColorIndex: 47,
  params: [lengthParam(20)],
  compute: (d, p) => {
    const n = num(p, "length", 20);
    const mfv = d.close.map((c, i) => {
      const h = d.high[i]!;
      const l = d.low[i]!;
      const mfm = h === l ? 0 : ((c - l) - (h - c)) / (h - l);
      return mfm * d.volume[i]!;
    });
    const vol = sumRolling(d.volume, n);
    return res("cmf", "CMF", map2(sumRolling(mfv, n), vol, (a, b) => (b === 0 ? 0 : a / b)));
  },
};

const pvtDef: IndicatorDef = {
  id: "pvt",
  name: "Price Volume Trend",
  pane: "separate",
  family: "volume",
  defaultColorIndex: 48,
  params: [],
  compute: (d) => {
    const steps = d.close.map((c, i) => {
      const prev = d.close[i - 1];
      return prev === undefined || prev === 0 ? 0 : ((c - prev) / prev) * d.volume[i]!;
    });
    return res("pvt", "PVT", cumSum(steps));
  },
};

const eomDef: IndicatorDef = {
  id: "eom",
  name: "Ease of Movement",
  pane: "separate",
  family: "volume",
  defaultColorIndex: 49,
  params: [lengthParam(14)],
  compute: (d, p) => {
    const n = num(p, "length", 14);
    const midMove = d.high.map((h, i) => ((h + d.low[i]!) / 2 - (d.high[i - 1] !== undefined ? (d.high[i - 1]! + d.low[i - 1]!) / 2 : (h + d.low[i]!) / 2)));
    const boxRatio = d.high.map((h, i) => {
      const l = d.low[i]!;
      const range = h - l;
      return range === 0 || d.volume[i] === 0 ? 0 : d.volume[i]! / 1e6 / range;
    });
    const raw = midMove.map((m, i) => (boxRatio[i] === 0 ? 0 : m / boxRatio[i]!));
    return res("eom", "EOM", sma(raw, n));
  },
};

const vwmpDef: IndicatorDef = {
  id: "vwmp",
  name: "Volume Weighted Median Price",
  pane: "overlay",
  family: "volume",
  defaultColorIndex: 50,
  params: [],
  compute: (d) => {
    // Volume-weighted average of the typical price, per bar, cumulative.
    const flows = typicalVolume(d);
    const totalVol = cumSum(d.volume.map((v) => v));
    const totalFlow = cumSum(flows);
    return res(
      "vwmp",
      "VWMP",
      totalVol.map((v, i) => (v === 0 ? null : totalFlow[i]! / v)),
    );
  },
};

/** Second batch. Merged with the base catalogue by the registry. */
export const CATALOG_2: IndicatorDef[] = [
  hmaDef,
  almaDef,
  zlemaDef,
  demaDef,
  temaDef,
  kamaDef,
  linregDef,
  mcginleyDef,
  supertrendDef,
  ichimokuDef,
  psarDef,
  stochRsiDef,
  cciDef,
  mfiDef,
  rocDef,
  tsiDef,
  ultimateDef,
  awesomeDef,
  bullsDef,
  bearsDef,
  kstDef,
  ppoDef,
  pvoDef,
  keltnerDef,
  donchianDef,
  bbwidthDef,
  natrDef,
  adLineDef,
  adOscDef,
  cmfDef,
  pvtDef,
  eomDef,
  vwmpDef,
  priceSourceDef,
  medianPriceDef,
  typicalPriceDef,
  weightedCloseDef,
];
