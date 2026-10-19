export interface HeatmapItem {
  id: string;
  label: string;
  /** Tile area weight; must be > 0 to be drawn. */
  weight: number;
  /** Percent change, drives the color. */
  changePct: number;
}

export interface HeatmapTile extends HeatmapItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Worst aspect ratio of a candidate row laid along a side of the given length. */
const worst = (row: number[], side: number): number => {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
};

/**
 * Squarified treemap (Bruls et al.). Lays items out in the given rectangle so
 * tile areas are proportional to weight and aspect ratios stay close to 1.
 */
export function layoutHeatmap(items: HeatmapItem[], width: number, height: number): HeatmapTile[] {
  const sorted = items.filter((i) => i.weight > 0).toSorted((a, b) => b.weight - a.weight);
  const total = sorted.reduce((sum, i) => sum + i.weight, 0);
  if (sorted.length === 0 || total <= 0 || width <= 0 || height <= 0) return [];

  const scale = (width * height) / total;
  const queue = sorted.map((item) => ({ item, area: item.weight * scale }));
  const tiles: HeatmapTile[] = [];
  let rect = { x: 0, y: 0, w: width, h: height };

  while (queue.length > 0) {
    const side = Math.min(rect.w, rect.h);
    const row: typeof queue = [];
    while (queue.length > 0) {
      const candidate = [...row.map((r) => r.area), queue[0]!.area];
      if (row.length === 0 || worst(candidate, side) <= worst(row.map((r) => r.area), side)) {
        row.push(queue.shift()!);
      } else break;
    }
    const rowArea = row.reduce((s, r) => s + r.area, 0);
    if (rect.w >= rect.h) {
      const colW = rowArea / rect.h;
      let y = rect.y;
      for (const r of row) {
        const h = r.area / colW;
        tiles.push({ ...r.item, x: rect.x, y, w: colW, h });
        y += h;
      }
      rect = { x: rect.x + colW, y: rect.y, w: rect.w - colW, h: rect.h };
    } else {
      const rowH = rowArea / rect.w;
      let x = rect.x;
      for (const r of row) {
        const w = r.area / rowH;
        tiles.push({ ...r.item, x, y: rect.y, w, h: rowH });
        x += w;
      }
      rect = { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH };
    }
  }
  return tiles;
}

const mix = (a: number, b: number, k: number): number => Math.round(a + (b - a) * k);

/** Red → neutral → green, saturating at ±`cap` percent. */
export function heatColor(changePct: number, cap = 3): string {
  const t = Math.max(-1, Math.min(1, changePct / cap));
  const neutral = [42, 46, 57];
  const target = t >= 0 ? [38, 166, 154] : [239, 83, 80];
  const k = Math.abs(t);
  return `rgb(${mix(neutral[0]!, target[0]!, k)}, ${mix(neutral[1]!, target[1]!, k)}, ${mix(neutral[2]!, target[2]!, k)})`;
}
