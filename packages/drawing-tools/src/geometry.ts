import type { ScreenPoint } from "./types.js";

/** Squared distance from a point to a segment — avoids sqrt in hot hit-tests. */
export function distSqToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return (p.x - px) ** 2 + (p.y - py) ** 2;
}

export function distToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  return Math.sqrt(distSqToSegment(p, a, b));
}

/** Distance from a point to an infinite line through a and b (for ray/extended). */
export function distToInfiniteLine(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

export function insideRect(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint, pad = 0): boolean {
  const x0 = Math.min(a.x, b.x) - pad;
  const x1 = Math.max(a.x, b.x) + pad;
  const y0 = Math.min(a.y, b.y) - pad;
  const y1 = Math.max(a.y, b.y) + pad;
  return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
}

/** Axis-aligned bounding box of a screen point list. */
export function bounds(points: ScreenPoint[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

export function near(p: ScreenPoint, q: ScreenPoint, tol: number): boolean {
  return (p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= tol * tol;
}
