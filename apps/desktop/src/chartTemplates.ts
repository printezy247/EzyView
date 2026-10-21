/**
 * Chart templates: a named look (chart type, volume/grid/theme/scale options)
 * plus its indicators, applied to any chart without touching that chart's
 * symbol, interval or drawings. Indicators are saved by id and parameters
 * only; their compute functions never travel, so applying re-resolves each id
 * and drops any that no longer exist.
 */
import type { IndicatorDef } from "@ezyview/indicators";
import type { ActiveIndicator, ChartState } from "./layout";

export interface TemplateIndicator {
  defId: string;
  params: ActiveIndicator["params"];
  colorIndex: number;
  hidden?: boolean;
  name?: string;
}

export interface ChartTemplate {
  id: string;
  name: string;
  chartType: ChartState["chartType"];
  showVolume: boolean;
  showVolumeProfile?: boolean;
  boxSize?: number | null;
  showGrid: boolean;
  theme: ChartState["theme"];
  crosshairMode?: ChartState["crosshairMode"];
  priceScale?: ChartState["priceScale"];
  invertScale?: boolean;
  timezone?: string;
  watermark?: boolean;
  /** Shade bars outside the symbol's trading session. */
  showSessionBreaks?: boolean;
  indicators: TemplateIndicator[];
}

const MAX_TEMPLATES = 50;
const MAX_NAME = 40;

export function templateFromChart(chart: ChartState, name: string, id: string): ChartTemplate {
  return {
    id,
    name: name.trim().slice(0, MAX_NAME) || "Template",
    chartType: chart.chartType,
    showVolume: chart.showVolume,
    ...(chart.showVolumeProfile !== undefined ? { showVolumeProfile: chart.showVolumeProfile } : {}),
    ...(chart.boxSize !== undefined ? { boxSize: chart.boxSize } : {}),
    showGrid: chart.showGrid,
    theme: chart.theme,
    ...(chart.crosshairMode !== undefined ? { crosshairMode: chart.crosshairMode } : {}),
    ...(chart.priceScale !== undefined ? { priceScale: chart.priceScale } : {}),
    ...(chart.invertScale !== undefined ? { invertScale: chart.invertScale } : {}),
    ...(chart.timezone !== undefined ? { timezone: chart.timezone } : {}),
    ...(chart.watermark !== undefined ? { watermark: chart.watermark } : {}),
    ...(chart.showSessionBreaks !== undefined ? { showSessionBreaks: chart.showSessionBreaks } : {}),
    indicators: chart.indicators.map((i) => ({
      defId: i.def.id,
      params: i.params,
      colorIndex: i.colorIndex,
      ...(i.hidden ? { hidden: true } : {}),
      ...(i.name ? { name: i.name } : {}),
    })),
  };
}

/** The chart with the template's look and indicators; symbol, interval and drawings stay. */
export function applyTemplate(
  chart: ChartState,
  template: ChartTemplate,
  resolveDef: (id: string) => IndicatorDef | null | undefined,
  newUid: () => string,
): ChartState {
  const indicators: ActiveIndicator[] = [];
  for (const t of template.indicators) {
    const def = resolveDef(t.defId);
    if (!def) continue;
    indicators.push({
      uid: newUid(),
      def,
      params: { ...t.params },
      colorIndex: t.colorIndex,
      ...(t.hidden ? { hidden: true } : {}),
      ...(t.name ? { name: t.name } : {}),
    });
  }
  const { id: _id, name: _name, indicators: _indicators, ...look } = template;
  return { ...chart, ...look, indicators };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Rebuild saved templates from storage; rows missing the required fields are dropped. */
export function restoreTemplates(raw: unknown): ChartTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: ChartTemplate[] = [];
  for (const row of raw) {
    if (!isObject(row)) continue;
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    if (typeof row.chartType !== "string" || typeof row.theme !== "string") continue;
    if (typeof row.showVolume !== "boolean" || typeof row.showGrid !== "boolean" || !Array.isArray(row.indicators)) continue;
    const indicators = row.indicators.filter(
      (i): i is TemplateIndicator => isObject(i) && typeof i.defId === "string" && isObject(i.params) && typeof i.colorIndex === "number",
    );
    out.push({ ...(row as unknown as ChartTemplate), indicators });
    if (out.length >= MAX_TEMPLATES) break;
  }
  return out;
}
