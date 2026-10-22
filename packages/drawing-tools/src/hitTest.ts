import type { Drawing } from "./types.js";
import { bounds, distToSegment, distToRay, distToInfiniteLine, insideRect, near } from "./geometry.js";
import { fibLevels, FIB_EXTENSION_RATIOS } from "./fib.js";
import type { ScreenPoint } from "./types.js";

export interface HitResult {
  id: string;
  /** 0-based anchor index, or -1 for the body. */
  handle: number;
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

  switch (drawing.tool) {
    case "trend_line": {
      if (screen.length < 2) return null;
      return distToSegment(click, screen[0]!, screen[1]!) <= tol ? { id: drawing.id, handle: -1 } : null;
    }
    case "ray": {
      if (screen.length < 2) return null;
      return distToRay(click, screen[0]!, screen[1]!) <= tol ? { id: drawing.id, handle: -1 } : null;
    }
    case "extended_line": {
      if (screen.length < 2) return null;
      return distToInfiniteLine(click, screen[0]!, screen[1]!) <= tol ? { id: drawing.id, handle: -1 } : null;
    }
    case "horizontal_line": {
      if (screen.length < 1) return null;
      return Math.abs(click.y - screen[0]!.y) <= tol ? { id: drawing.id, handle: -1 } : null;
    }
    case "vertical_line": {
      if (screen.length < 1) return null;
      return Math.abs(click.x - screen[0]!.x) <= tol ? { id: drawing.id, handle: -1 } : null;
    }
    case "rectangle":
    case "ellipse":
    case "measure": {
      if (screen.length < 2) return null;
      return insideRect(click, screen[0]!, screen[1]!, tol) ? { id: drawing.id, handle: -1 } : null;
    }
    case "fib_retracement": {
      if (screen.length < 2) return null;
      const box = bounds(pts);
      const insideX = click.x >= box.x0 - tol && click.x <= box.x1 + tol;
      if (!insideX) return null;
      if (click.y >= box.y0 - tol && click.y <= box.y1 + tol) return { id: drawing.id, handle: -1 };
      // Also accept a click sitting on any computed level line.
      const prices = fibLevels(drawing.points[0]!.price, drawing.points[1]!.price);
      const [a, b] = screen;
      for (const level of prices) {
        const t = (level.price - drawing.points[0]!.price) / (drawing.points[1]!.price - drawing.points[0]!.price || 1);
        const y = a!.y + (b!.y - a!.y) * t;
        if (Math.abs(click.y - y) <= tol) return { id: drawing.id, handle: -1 };
      }
      return null;
    }
    case "fib_extension": {
      if (screen.length < 3) return null;
      const [a, b, c] = screen;
      if (!a || !b || !c) return null;
      // Hit on anchor segments
      if (distToSegment(click, a, b) <= tol || distToSegment(click, b, c) <= tol) {
        return { id: drawing.id, handle: -1 };
      }
      const box = bounds(pts);
      const insideX = click.x >= box.x0 - tol && click.x <= box.x1 + tol;
      if (!insideX) return null;
      // Hit on extension horizontal lines
      for (const ratio of FIB_EXTENSION_RATIOS) {
        const y = c.y + (b.y - a.y) * ratio;
        if (Math.abs(click.y - y) <= tol) return { id: drawing.id, handle: -1 };
      }
      return null;
    }
    default: {
      if (screen.length === 0) return null;
      const box = bounds(pts);
      return insideRect(click, { x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 }, tol)
        ? { id: drawing.id, handle: -1 }
        : null;
    }
  }
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
