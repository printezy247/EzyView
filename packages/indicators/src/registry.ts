import type { IndicatorDef } from "./types.js";

/**
 * Static indicator catalogue. `catalog()` returns everything shipped with
 * EzyView (the full 50+ list lands in P2).
 */
export function catalog(): IndicatorDef[] {
  return [];
}

export function getIndicator(id: string): IndicatorDef | null {
  return catalog().find((d) => d.id === id) ?? null;
}
