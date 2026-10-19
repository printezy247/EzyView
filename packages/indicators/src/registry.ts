import { CATALOG } from "./catalog.js";
import type { IndicatorDef } from "./types.js";

/** Full shipped indicator catalogue. */
export function catalog(): IndicatorDef[] {
  return CATALOG;
}

export function getIndicator(id: string): IndicatorDef | null {
  return CATALOG.find((d) => d.id === id) ?? null;
}

/** Indicator ids grouped by family, for the indicator picker UI. */
export function catalogByFamily(): Record<string, IndicatorDef[]> {
  const out: Record<string, IndicatorDef[]> = {};
  for (const def of CATALOG) (out[def.family] ??= []).push(def);
  return out;
}
