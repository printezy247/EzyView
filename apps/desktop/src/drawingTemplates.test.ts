import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyDrawingTemplate, listDrawingTemplates, saveDrawingTemplate } from "./drawingTemplates";
import { useWorkspace } from "./store";
import type { DrawingStyle } from "@ezyview/drawing-tools";

/**
 * Drawing templates persist in localStorage. Node environment — stubbed by
 * hand, same pattern as nav.test.ts.
 */

const KEY = "ezyview.drawingTemplates";

const h = vi.hoisted(() => ({ storage: new Map<string, string>() }));

function armLocalStorage(): void {
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => h.storage.get(k) ?? null,
    setItem: (k: string, v: string) => void h.storage.set(k, v),
    removeItem: (k: string) => void h.storage.delete(k),
  };
}

function disarmLocalStorage(): void {
  delete (globalThis as Record<string, unknown>).localStorage;
}

const STYLE_A: DrawingStyle = { color: "#f23645", width: 3, lineStyle: "dashed" };
const STYLE_B: DrawingStyle = { color: "#4caf50", width: 2, lineStyle: "solid", showLabels: false };

beforeEach(() => {
  h.storage.clear();
  armLocalStorage();
  return () => disarmLocalStorage();
});

describe("drawing templates", () => {
  it("saves a template and lists it back", () => {
    const saved = saveDrawingTemplate("Thick red", STYLE_A);
    const list = listDrawingTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ id: saved.id, name: "Thick red", style: STYLE_A });
  });

  it("keeps multiple templates in save order", () => {
    saveDrawingTemplate("A", STYLE_A);
    saveDrawingTemplate("B", STYLE_B);
    expect(listDrawingTemplates().map((t) => t.name)).toEqual(["A", "B"]);
  });

  it("replaces the template with the same name instead of duplicating", () => {
    saveDrawingTemplate("Thick red", STYLE_A);
    saveDrawingTemplate("Thick red", STYLE_B);
    const list = listDrawingTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]?.style).toEqual(STYLE_B);
  });

  it("returns an empty list for corrupt storage", () => {
    h.storage.set(KEY, "{not json");
    expect(listDrawingTemplates()).toEqual([]);
  });

  it("applies a template style onto a drawing via the store", () => {
    const tpl = saveDrawingTemplate("Thick red", STYLE_A);
    useWorkspace.getState().addLayout();
    const chartIdx = useWorkspace.getState().activeLayout().activeChart;
    useWorkspace.getState().setDrawings(
      [
        {
          id: "D1",
          tool: "horizontal_line",
          points: [{ time: 0, price: 100 }],
          style: { color: "#2962ff", width: 1, lineStyle: "solid" },
        },
      ],
      chartIdx,
    );

    expect(applyDrawingTemplate(tpl.id, "D1")).toBe(true);
    const applied = useWorkspace
      .getState()
      .activeLayout()
      .charts[chartIdx]?.drawings.find((d) => d.id === "D1");
    expect(applied?.style).toEqual(STYLE_A);
  });

  it("returns false for unknown template or drawing", () => {
    expect(applyDrawingTemplate("missing", "D1")).toBe(false);
  });
});
