/**
 * Dragging the entry, stop and target lines on the chart.
 *
 * Two pure functions do the thinking: `hitTestLevel` decides which rendered
 * level a pointer is over, and `moveLevel` turns a converted price into the new
 * level. The engine is only asked for coordinate/price conversions, so the
 * gesture is testable without a canvas and cannot write a NaN into a stop.
 */

/** How close, in pixels, the pointer must be to a level line to grab it. */
export const HIT_SLOP_PX = 6;

export interface DraggableLevel {
  id: string;
  price: number;
  /** Y coordinate of the level as rendered, or null when off the plot area. */
  y: number | null;
}

/**
 * The nearest level within `slop` pixels of `y`, or null.
 *
 * Ties go to the closer line, which is what a user expects when two levels are
 * stacked; a line with no coordinate is never returned, so an off-screen level
 * cannot be grabbed by a pointer that happens to share its row.
 */
export function hitTestLevel(levels: readonly DraggableLevel[], y: number, slop = HIT_SLOP_PX): DraggableLevel | null {
  let best: DraggableLevel | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const level of levels) {
    if (level.y === null) continue;
    const distance = Math.abs(level.y - y);
    if (distance <= slop && distance < bestDistance) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The price a dragged level should take. Null when the pointer did not convert
 * to a price (off the scale) or converted to something non-finite — the caller
 * leaves the level where it was rather than committing a broken value.
 */
export function moveLevel(_level: DraggableLevel, price: number | null): number | null {
  if (price === null || !Number.isFinite(price)) return null;
  return price;
}
