import { CATALOG } from "./catalog.js";
import { CATALOG_2 } from "./catalog2.js";
import type { IndicatorDef } from "./types.js";

/** Every indicator shipped with EzyView, both batches. */
export const FULL_CATALOG: IndicatorDef[] = [...CATALOG, ...CATALOG_2];

/** Full shipped indicator catalogue. */
export function catalog(): IndicatorDef[] {
  return FULL_CATALOG;
}

export function getIndicator(id: string): IndicatorDef | null {
  return FULL_CATALOG.find((d) => d.id === id) ?? null;
}

/** Indicator ids grouped by family, for the indicator picker UI. */
export function catalogByFamily(): Record<string, IndicatorDef[]> {
  const out: Record<string, IndicatorDef[]> = {};
  for (const def of FULL_CATALOG) (out[def.family] ??= []).push(def);
  return out;
}

/** Dynamically import an indicator definition on demand. */
export async function loadIndicator(id: string): Promise<IndicatorDef | null> {
  const sync = getIndicator(id);
  if (sync) return sync;
  const [{ CATALOG }, { CATALOG_2 }] = await Promise.all([
    import("./catalog.js"),
    import("./catalog2.js"),
  ]);
  return [...CATALOG, ...CATALOG_2].find((d) => d.id === id) ?? null;
}

/** Dynamically load the full indicator catalogue. */
export async function loadCatalog(): Promise<IndicatorDef[]> {
  const [{ CATALOG }, { CATALOG_2 }] = await Promise.all([
    import("./catalog.js"),
    import("./catalog2.js"),
  ]);
  return [...CATALOG, ...CATALOG_2];
}
