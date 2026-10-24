/**
 * Indicator benchmark over 100k bars (Phase 5 gate).
 *
 * Run: npm run bench:indicators
 * Prints per-helper wall time on 100k synthetic bars. The streaming / deque
 * helpers must stay single-pass; if a regression reintroduces a hot inner
 * loop the timing jump makes it obvious. Not asserted in CI — a human gate
 * before a release, kept deterministic (seeded walk) so numbers are comparable
 * across runs on the same machine.
 */
import {
  alma,
  cumSum,
  ema,
  fillForward,
  highest,
  linregSlope,
  lowest,
  map2,
  rma,
  round,
  sma,
  stdev,
  sumRolling,
  trueRange,
  wma,
} from "../packages/indicators/src/helpers.js";
import type { OHLCV } from "../packages/indicators/src/helpers.js";

const BARS = 100_000;

const walk = (n: number, seed: number, step = 1): number[] => {
  let x = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    out.push(((Math.abs(x) % 20_000) / step) / 100);
  }
  return out;
};

const close = walk(BARS, 1234);
const data: OHLCV = {
  open: close.map((v) => v - 0.02),
  high: close.map((v) => v + 0.05),
  low: close.map((v) => v - 0.05),
  close,
  volume: walk(BARS, 777, 100),
};

const MODEST = [20, 50, 200];

// Naive O(n·p) references for the helpers this phase made single-pass — printed
// after the streaming numbers so the improvement is visible, not assumed.
const naiveWma = (values: number[], period: number): (number | null)[] => {
  const out: (number | null)[] = Array.from({ length: values.length }, () => null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j]! * (period - j);
    out[i] = sum / denom;
  }
  return out;
};

const naiveSlope = (values: number[], period: number): (number | null)[] => {
  const out: (number | null)[] = Array.from({ length: values.length }, () => null);
  const sumX = (period * (period - 1)) / 2;
  const sumXX = (period * (period - 1) * (2 * period - 1)) / 6;
  const denom = period * sumXX - sumX * sumX;
  for (let i = period - 1; i < values.length; i++) {
    let sumY = 0;
    let sumXY = 0;
    for (let j = 0; j < period; j++) {
      const y = values[i - j]!;
      sumY += y;
      sumXY += j * y;
    }
    out[i] = (period * sumXY - sumX * sumY) / denom;
  }
  return out;
};

const runs: { name: string; fn: () => unknown }[] = [
  { name: "sma(20)", fn: () => sma(close, 20) },
  { name: "ema(50)", fn: () => ema(close, 50) },
  { name: "rma(200)", fn: () => rma(close, 200) },
  { name: "stdev(50)", fn: () => stdev(close, 50) },
  { name: "wma(50)", fn: () => wma(close, 50) },
  { name: "alma(50)", fn: () => alma(close, 50) },
  { name: "linregSlope(50)", fn: () => linregSlope(close, 50) },
  { name: "highest(50)", fn: () => highest(close, 50) },
  { name: "lowest(50)", fn: () => lowest(close, 50) },
  { name: "sumRolling(200)", fn: () => sumRolling(close, 200) },
  { name: "trueRange", fn: () => trueRange(data) },
  {
    name: "map2+fillForward+round",
    fn: () => {
      for (const p of MODEST) {
        void round(fillForward(map2(sma(close, p), ema(close, p), (a, b) => a - b)));
      }
    },
  },
  {
    name: "cumSum(100k)",
    fn: () => cumSum(sma(close, 20)),
  },
];

console.log(`Indicators over ${BARS.toLocaleString()} bars (seeded walk):\n`);
let skipped = 0;
for (const run of runs) {
  try {
    // Warm once, then time a full pass.
    run.fn();
    const t0 = performance.now();
    run.fn();
    const ms = performance.now() - t0;
    console.log(`  ${run.name.padEnd(26)} ${ms.toFixed(1).padStart(8)} ms`);
  } catch (e) {
    skipped += 1;
    console.log(`  ${run.name.padEnd(26)} FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}

for (const [label, fn] of [
  ["naive wma(50)", () => naiveWma(close, 50)],
  ["naive linregSlope(50)", () => naiveSlope(close, 50)],
] as const) {
  fn();
  const t0 = performance.now();
  fn();
  console.log(`  ${label.padEnd(26)} ${(performance.now() - t0).toFixed(1).padStart(8)} ms`);
}
if (skipped > 0) {
  process.exitCode = 1;
  console.log(`\n${skipped} helper(s) threw — fix before release.`);
}
