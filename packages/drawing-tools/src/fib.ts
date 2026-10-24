import type { DrawingStyle, FibLevelStyle, Point } from "./types.js";

export interface FibLevel {
  /** 0 = anchor A price, 1 = anchor B price. */
  ratio: number;
  price: number;
  label: string;
  /** Per-level colour from `style.fibLevels`, when one was set. */
  color?: string;
}

const RETRACEMENT = [
  { ratio: 0, label: "0.0%" },
  { ratio: 0.236, label: "23.6%" },
  { ratio: 0.382, label: "38.2%" },
  { ratio: 0.5, label: "50.0%" },
  { ratio: 0.618, label: "61.8%" },
  { ratio: 0.786, label: "78.6%" },
  { ratio: 1, label: "100.0%" },
  { ratio: 1.618, label: "161.8%" },
  { ratio: 2.618, label: "261.8%" },
];

/** Linear interpolation between two anchor prices at each Fibonacci ratio. */
export function fibLevels(priceA: number, priceB: number, ratios: readonly { ratio: number; label: string }[] = RETRACEMENT): FibLevel[] {
  const delta = priceB - priceA;
  return ratios.map(({ ratio, label }) => ({ ratio, label, price: priceA + delta * ratio }));
}

export const FIB_RETRACEMENT_LEVELS = RETRACEMENT;
export const FIB_EXTENSION_RATIOS = [0, 0.618, 1, 1.618, 2.618, 4.236] as const;

const EXTENSION = FIB_EXTENSION_RATIOS.map((ratio) => ({ ratio, label: `${(ratio * 100).toFixed(1)}%` }));

/**
 * Extension levels: the third anchor is the projection start, and each level
 * extends it by `ratio × (anchor 2 − anchor 1)` in price. Custom level rows and
 * per-level colours apply here the same way they do for retracements.
 */
export function resolvedFibExtensionLevels(
  points: readonly Point[],
  style: Pick<DrawingStyle, "fibLevels">,
): FibLevel[] {
  const p0 = points[0]?.price;
  const p1 = points[1]?.price;
  const p2 = points[2]?.price;
  if (p0 === undefined || p1 === undefined || p2 === undefined) return [];
  const rows: readonly FibLevelStyle[] = style.fibLevels && style.fibLevels.length > 0
    ? style.fibLevels
    : EXTENSION.map((level) => ({ ratio: level.ratio, label: level.label, enabled: true }));
  return rows
    .filter((level) => level.enabled && Number.isFinite(level.ratio))
    .map((level) => {
      const out: FibLevel = {
        ratio: level.ratio,
        label: level.label,
        price: p2 + (p1 - p0) * level.ratio,
      };
      if (level.color) out.color = level.color;
      return out;
    });
}

/**
 * The levels a fib drawing actually renders: custom enabled levels when set,
 * otherwise the standard retracement set, measured between the anchors (or
 * reversed when the drawing asks for it).
 *
 * Shared by hit-testing and rendering so a click can never land on a level the
 * canvas did not draw.
 */
export function resolvedFibLevels(
  points: readonly Point[],
  style: Pick<DrawingStyle, "fibLevels" | "reverse">,
  ratios: readonly FibLevelStyle[] = RETRACEMENT.map((r) => ({ ratio: r.ratio, label: r.label, enabled: true })),
): FibLevel[] {
  const a = points[0]?.price;
  const b = points[1]?.price;
  if (a === undefined || b === undefined) return [];
  const styleLevels = style.fibLevels && style.fibLevels.length > 0 ? style.fibLevels : ratios;
  const levels = styleLevels.filter((level) => level.enabled && Number.isFinite(level.ratio));
  const from = style.reverse ? b : a;
  const to = style.reverse ? a : b;
  return levels.map((level) => {
    const out: FibLevel = {
      ratio: level.ratio,
      label: level.label,
      price: from + (to - from) * level.ratio,
    };
    if (level.color) out.color = level.color;
    return out;
  });
}
