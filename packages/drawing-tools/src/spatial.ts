import type { Drawing, ScreenPoint } from "./types.js";

export interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Axis-aligned bounds of projected anchors; null when nothing projects. */
export function projectedBounds(points: readonly (ScreenPoint | null)[]): ScreenBox | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const point of points) {
    if (!point) continue;
    x0 = Math.min(x0, point.x);
    y0 = Math.min(y0, point.y);
    x1 = Math.max(x1, point.x);
    y1 = Math.max(y1, point.y);
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

interface Entry {
  id: string;
  box: ScreenBox;
}

/**
 * Uniform grid over projected drawing bounds.
 *
 * A chart with hundreds of drawings used to run every tool's geometry for every
 * click. The grid turns that into "test the handful of drawings whose bounds
 * contain the pointer". It is rebuilt from fresh projections, so zoom/pan never
 * leaves a stale bucket behind.
 */
export class SpatialIndex {
  private readonly cells = new Map<string, Entry[]>();
  private readonly all: Entry[] = [];

  constructor(
    entries: readonly { id: string; box: ScreenBox }[],
    private readonly size = 128,
  ) {
    for (const entry of entries) {
      this.all.push(entry);
      const cx0 = Math.floor(entry.box.x0 / size);
      const cy0 = Math.floor(entry.box.y0 / size);
      const cx1 = Math.floor(entry.box.x1 / size);
      const cy1 = Math.floor(entry.box.y1 / size);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const key = `${cx}:${cy}`;
          const bucket = this.cells.get(key) ?? [];
          bucket.push(entry);
          this.cells.set(key, bucket);
        }
      }
    }
  }

  /** Ids whose bounding box contains the point, padded by `pad` pixels. */
  query(x: number, y: number, pad = 8): string[] {
    const bucket = this.cells.get(`${Math.floor(x / this.size)}:${Math.floor(y / this.size)}`);
    if (!bucket) return [];
    return bucket
      .filter((entry) => x >= entry.box.x0 - pad && x <= entry.box.x1 + pad && y >= entry.box.y0 - pad && y <= entry.box.y1 + pad)
      .map((entry) => entry.id);
  }

  /** Ids whose bounds intersect the viewport, for culling. */
  visible(width: number, height: number): Set<string> {
    const out = new Set<string>();
    for (const entry of this.all) {
      if (entry.box.x1 >= 0 && entry.box.x0 <= width && entry.box.y1 >= 0 && entry.box.y0 <= height) out.add(entry.id);
    }
    return out;
  }
}

/** Build an index from already-projected drawings. */
export function indexProjected(
  drawings: readonly Drawing[],
  project: (drawing: Drawing) => readonly (ScreenPoint | null)[],
): { index: SpatialIndex; projected: Map<string, readonly (ScreenPoint | null)[]> } {
  const projected = new Map<string, readonly (ScreenPoint | null)[]>();
  const entries: { id: string; box: ScreenBox }[] = [];
  for (const drawing of drawings) {
    const points = project(drawing);
    projected.set(drawing.id, points);
    const box = projectedBounds(points);
    if (box) entries.push({ id: drawing.id, box });
  }
  return { index: new SpatialIndex(entries), projected };
}
