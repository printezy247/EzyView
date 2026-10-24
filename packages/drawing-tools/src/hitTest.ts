import type { Drawing } from "./types.js";
import {
  bounds,
  distToPolyline,
  distToInfiniteLine,
  distToSegment,
  distToSegmentExtended,
  insidePolygon,
  insideRect,
  near,
} from "./geometry.js";
import { resolvedFibExtensionLevels, resolvedFibLevels } from "./fib.js";
import type { ScreenPoint } from "./types.js";

export interface HitResult {
  id: string;
  /** 0-based anchor index, or -1 for the body. */
  handle: number;
}

const bodyHit = (drawing: Drawing): HitResult => ({ id: drawing.id, handle: -1 });

/** Extend flags as a pair, defaulting to a plain segment. */
const extendOf = (d: Drawing): [boolean, boolean] => [d.style.extendLeft === true, d.style.extendRight === true];

/** Distance to a straight tool, honoring its extend-left/right settings. */
function lineDistance(d: Drawing, click: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const [left, right] = extendOf(d);
  return left || right ? distToSegmentExtended(click, a, b, left, right) : distToSegment(click, a, b);
}

/**
 * Hit-test one drawing in pixel space.
 *
 * `screen` holds the drawing's anchors already projected to pixels, in the same
 * order as `drawing.points`. A null entry means that anchor is off-view (the
 * projection could not place it): visible anchors still grab, but the body is
 * skipped until every point projects — the same condition the renderer uses
 * before drawing the shape.
 */
export function hitTest(
  drawing: Drawing,
  screen: (ScreenPoint | null)[],
  click: ScreenPoint,
  tol = 6,
): HitResult | null {
  if (drawing.hidden) return null;

  // Anchor grabs win over body hits so handles stay draggable when overlapping.
  for (let i = 0; i < screen.length; i++) {
    const p = screen[i];
    if (p && near(click, p, tol)) return { id: drawing.id, handle: i };
  }

  // Off-view anchors make the body's geometry degenerate — skip it.
  if (screen.some((p) => p === null)) return null;
  const pts = screen as ScreenPoint[];
  const [a, b, c] = pts;

  switch (drawing.tool) {
    case "trend_line":
    case "info_line": {
      if (!a || !b) return null;
      return lineDistance(drawing, click, a, b) <= tol ? bodyHit(drawing) : null;
    }
    case "ray": {
      if (!a || !b) return null;
      // A ray only exists forward of its origin.
      return distToSegmentExtended(click, a, b, false, true) <= tol ? bodyHit(drawing) : null;
    }
    case "extended_line": {
      if (!a || !b) return null;
      return distToInfiniteLine(click, a, b) <= tol ? bodyHit(drawing) : null;
    }
    case "horizontal_line": {
      if (!a) return null;
      return Math.abs(click.y - a.y) <= tol ? bodyHit(drawing) : null;
    }
    case "horizontal_ray": {
      if (!a) return null;
      return Math.abs(click.y - a.y) <= tol && click.x >= a.x - tol ? bodyHit(drawing) : null;
    }
    case "vertical_line": {
      if (!a) return null;
      return Math.abs(click.x - a.x) <= tol ? bodyHit(drawing) : null;
    }
    case "rectangle":
    case "measure": {
      if (!a || !b) return null;
      const [left, right] = extendOf(drawing);
      const x0 = left ? -Infinity : Math.min(a.x, b.x) - tol;
      const x1 = right ? Infinity : Math.max(a.x, b.x) + tol;
      const y0 = Math.min(a.y, b.y) - tol;
      const y1 = Math.max(a.y, b.y) + tol;
      const inside = click.x >= x0 && click.x <= x1 && click.y >= y0 && click.y <= y1;
      return inside ? bodyHit(drawing) : null;
    }
    case "ellipse": {
      if (!a || !b) return null;
      return insideRect(click, a, b, tol) ? bodyHit(drawing) : null;
    }
    case "parallel_channel": {
      if (!a || !b || !c) return null;
      const offX = c.x - a.x;
      const offY = c.y - a.y;
      const d = { x: b.x + offX, y: b.y + offY };
      const [left, right] = extendOf(drawing);
      const base = distToSegmentExtended(click, a, b, left, right);
      const parallel = distToSegmentExtended(click, c, d, left, right);
      const middle = distToSegmentExtended(
        click,
        { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 },
        { x: (b.x + d.x) / 2, y: (b.y + d.y) / 2 },
        left,
        right,
      );
      if (Math.min(base, parallel, middle) <= tol) return bodyHit(drawing);
      return drawing.style.fill && insidePolygon(click, [a, b, d, c]) ? bodyHit(drawing) : null;
    }
    case "fib_retracement": {
      if (!a || !b) return null;
      const levels = resolvedFibLevels(drawing.points, drawing.style);
      if (levels.length === 0) return null;
      const [left, right] = extendOf(drawing);
      const box = bounds(pts);
      const x0 = left ? -Infinity : box.x0 - tol;
      const x1 = right ? Infinity : box.x1 + tol;
      if (click.x < x0 || click.x > x1) return null;
      const ys = levels
        .map((level) => screenYForPrice(drawing, level.price, a, b))
        .filter((y): y is number => y !== null);
      if (ys.length === 0) return null;
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      // Anywhere inside the band, or right on a level line outside it.
      if (click.y >= y0 - tol && click.y <= y1 + tol) return bodyHit(drawing);
      return ys.some((y) => Math.abs(click.y - y) <= tol) ? bodyHit(drawing) : null;
    }
    case "fib_extension": {
      if (!a || !b || !c) return null;
      if (distToSegment(click, a, b) <= tol || distToSegment(click, b, c) <= tol) return bodyHit(drawing);
      // Levels radiate from the third anchor by ratio × the 1→2 screen delta.
      const levels = resolvedFibExtensionLevels(drawing.points, drawing.style);
      return levels.some((level) => Math.abs(click.y - (c.y + (b.y - a.y) * level.ratio)) <= tol)
        ? bodyHit(drawing)
        : null;
    }
    case "triangle": {
      if (!a || !b || !c) return null;
      if (
        distToSegment(click, a, b) <= tol ||
        distToSegment(click, b, c) <= tol ||
        distToSegment(click, c, a) <= tol ||
        insidePolygon(click, [a, b, c])
      ) {
        return bodyHit(drawing);
      }
      return null;
    }
    case "arrow": {
      if (!a || !b) return null;
      return distToSegment(click, a, b) <= tol || near(click, b, tol * 2) ? bodyHit(drawing) : null;
    }
    case "brush": {
      if (pts.length === 0) return null;
      return distToPolyline(click, pts) <= tol ? bodyHit(drawing) : null;
    }
    case "text": {
      if (!a) return null;
      const fontSize = drawing.style.fontSize ?? 13;
      const lines = (drawing.text ?? "Text").split("\n");
      const width = Math.max(fontSize * 2, Math.max(...lines.map((l) => l.length)) * fontSize * 0.6);
      return insideRect(click, a, { x: a.x + width, y: a.y + lines.length * fontSize * 1.25 }, tol)
        ? bodyHit(drawing)
        : null;
    }
    case "callout": {
      if (!a || !b) return null;
      // The leader line or the text box (rendered 140×26 at the second anchor).
      if (distToSegment(click, a, b) <= tol) return bodyHit(drawing);
      return insideRect(click, b, { x: b.x + 140, y: b.y + 26 }, tol) ? bodyHit(drawing) : null;
    }
    case "long_position":
    case "short_position": {
      if (!a || !b || !c) return null;
      const x0 = Math.min(a.x, b.x, c.x);
      const x1 = pts[3]?.x ?? Math.max(a.x, b.x, c.x);
      const y0 = Math.min(a.y, b.y, c.y);
      const y1 = Math.max(a.y, b.y, c.y);
      const onEdge =
        Math.abs(click.x - x1) <= tol && click.y >= y0 - tol && click.y <= y1 + tol;
      const onLine =
        click.x >= x0 - tol &&
        click.x <= x1 + tol &&
        (Math.abs(click.y - a.y) <= tol || Math.abs(click.y - b.y) <= tol || Math.abs(click.y - c.y) <= tol);
      if (onEdge || onLine) return bodyHit(drawing);
      return click.x >= x0 - tol && click.x <= x1 + tol && click.y >= y0 - tol && click.y <= y1 + tol
        ? bodyHit(drawing)
        : null;
    }
    default: {
      if (screen.length === 0) return null;
      const box = bounds(pts);
      return insideRect(click, { x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 }, tol)
        ? bodyHit(drawing)
        : null;
    }
  }
}

/**
 * Y pixel of an arbitrary price that is linearly interpolated between the two
 * projected anchors. Keeps fib levels aligned with the renderer without the
 * hit test needing a price scale.
 */
function screenYForPrice(drawing: Drawing, price: number, a: ScreenPoint, b: ScreenPoint): number | null {
  const p0 = drawing.points[0]?.price;
  const p1 = drawing.points[1]?.price;
  if (p0 === undefined || p1 === undefined || p1 === p0) return null;
  const t = (price - p0) / (p1 - p0);
  return a.y + (b.y - a.y) * t;
}

/** Topmost hit across a layer, first match wins (later drawings sit on top). */
export function hitTestAll(
  layers: { drawing: Drawing; screen: (ScreenPoint | null)[] }[],
  click: ScreenPoint,
  tol = 6,
): HitResult | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!;
    const hit = hitTest(layer.drawing, layer.screen, click, tol);
    if (hit) return hit;
  }
  return null;
}
