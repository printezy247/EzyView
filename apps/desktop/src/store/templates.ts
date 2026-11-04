import { getIndicator } from "@ezyview/indicators";
import { activeChartOf } from "../layout";
import { applyTemplate, templateFromChart } from "../chartTemplates";
import { editChart, uid } from "./helpers";
import type { WorkspaceStore } from "./types";

type SliceSet = (
  partial: Partial<WorkspaceStore> | ((s: WorkspaceStore) => Partial<WorkspaceStore> | WorkspaceStore),
) => void;

type TemplateSliceKeys = "chartTemplates" | "saveChartTemplate" | "applyChartTemplate" | "deleteChartTemplate";

/** Chart-template slice: named looks + indicator stacks, applicable to any chart. */
export function createTemplatesSlice(
  set: SliceSet,
  get: () => WorkspaceStore,
): Pick<WorkspaceStore, TemplateSliceKeys> {
  return {
    chartTemplates: [],

      saveChartTemplate: (name) =>
        set((s) => ({
          chartTemplates: [...s.chartTemplates, templateFromChart(activeChartOf(s.activeLayout()), name, uid())].slice(-50),
        })),

      applyChartTemplate: (id) => {
        const template = get().chartTemplates.find((t) => t.id === id);
        if (!template) return;
        set((s) => editChart(s, (c) => applyTemplate(c, template, getIndicator, uid)));
      },

      deleteChartTemplate: (id) => set((s) => ({ chartTemplates: s.chartTemplates.filter((t) => t.id !== id) })),
  };
}
