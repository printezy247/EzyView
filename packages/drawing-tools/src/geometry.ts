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

/** Distance from a point to a ray starting at a and passing through b infinitely. */
export function distToRay(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, t); // Clamp only at origin a (t >= 0), extends infinitely along b
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/** Distance from a point to an infinite line through a and b (for extended line). */
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

/**
 * Distance to the segment A→B optionally continued past either anchor.
 *
 * `extendLeft`/`extendRight` refer to the parameter along A→B, so a line drawn
 * right-to-left still extends past the anchors the user pointed at, not past
 * the screen's left/right edge.
 */
export function distToSegmentExtended(
  p: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint,
  extendLeft = false,
  extendRight = false,
): number {
  if (extendLeft && extendRight) return distToInfiniteLine(p, a, b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const low = extendLeft ? -Infinity : 0;
  const high = extendRight ? Infinity : 1;
  const clamped = Math.max(low, Math.min(high, t));
  return Math.hypot(p.x - (a.x + clamped * dx), p.y - (a.y + clamped * dy));
}

/** Shortest distance from `p` to any segment of a polyline. */
export function distToPolyline(p: ScreenPoint, points: readonly ScreenPoint[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const d = distToSegment(p, points[i - 1]!, points[i]!);
    if (d < best) best = d;
  }
  return best;
}

/** Even-odd polygon containment; points may be given in any winding order. */
export function insidePolygon(p: ScreenPoint, polygon: readonly ScreenPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Midpoint of two screen points. */
export function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
