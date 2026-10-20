import type { Drawing, Point } from "./types.js";

/**
 * Move one anchor, leaving the others (and everything else about the
 * drawing) untouched. Out-of-range indices return the input unchanged so a
 * stale hit-test handle cannot corrupt a drawing mid-drag.
 */
export function setAnchor(d: Drawing, index: number, pt: Point): Drawing {
  if (index < 0 || index >= d.points.length) return d;
  const points = d.points.map((p, i) => (i === index ? pt : p));
  return { ...d, points };
}

/**
 * Shift every anchor by `dTime` seconds and `dPrice` price units — the
 * body-drag path. Times are epoch seconds throughout the app, so the shift is
 * a plain add.
 */
export function translateDrawing(d: Drawing, dTime: number, dPrice: number): Drawing {
  const points = d.points.map((p) => ({ time: p.time + dTime, price: p.price + dPrice }));
  return { ...d, points };
}
