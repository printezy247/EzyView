import type { Drawing } from "./types.js";
import { bounds, distToSegment, distToInfiniteLine, insideRect, near } from "./geometry.js";
import { fibLevels } from "./fib.js";
import type { ScreenPoint } from "./types.js";

export interface HitResult {
  id: string;
  /** 0 = body, 1..n = draggable anchor index. */
  handle: number;
}

/**
 * Hit-test one drawing in pixel space.
 *
 * `screen` holds the drawing's anchors already projected to pixels, in the same
 * order as `drawing.points`.
 */
export function hitTest(drawing: Drawing, screen: ScreenPoint[], click: ScreenPoint, tol = 6): HitResult | null {
  if (drawing.hidden) return null;

  // Anchor grabs win over body hits so handles stay draggable when overlapping.
  for (let i = 0; i < screen.length; i++) {
    if (near(click, screen[i]!, tol)) return { id: drawing.id, handle: i };
  }

  switch (drawing.tool) {
    case "trend_line": {
      if (screen.length < 2) return null;
      return distToSegment(click, screen[0]!, screen[1]!) <= tol ? { id: drawing.id, handle: -1 } : null;
    }
    case "ray":
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
    case "triangle":
    case "ellipse":
    case "measure":
    case "long_position":
    case "short_position": {
      if (screen.length < 2) return null;
      return insideRect(click, screen[0]!, screen[1]!, tol) ? { id: drawing.id, handle: -1 } : null;
    }
    case "fib_retracement":
    case "fib_extension": {
      if (screen.length < 2) return null;
      const box = bounds(screen);
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
    default: {
      if (screen.length === 0) return null;
      const box = bounds(screen);
      return insideRect(click, { x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 }, tol)
        ? { id: drawing.id, handle: -1 }
        : null;
    }
  }
}

/** Topmost hit across a layer, first match wins (later drawings sit on top). */
export function hitTestAll(
  layers: { drawing: Drawing; screen: ScreenPoint[] }[],
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
