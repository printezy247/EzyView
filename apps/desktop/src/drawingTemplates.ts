import type { DrawingStyle } from "@ezyview/drawing-tools";
import { useWorkspace } from "./store";

const KEY = "ezyview.drawingTemplates";

/** A named style preset reusable across drawings and layouts. */
export interface DrawingTemplate {
  id: string;
  name: string;
  style: DrawingStyle;
}

function read(): DrawingTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is DrawingTemplate =>
        typeof t === "object" &&
        t !== null &&
        typeof (t as DrawingTemplate).id === "string" &&
        typeof (t as DrawingTemplate).name === "string" &&
        typeof (t as DrawingTemplate).style === "object" &&
        (t as DrawingTemplate).style !== null,
    );
  } catch {
    return [];
  }
}

function write(list: DrawingTemplate[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Save `style` under `name`; an existing template with that name is replaced. */
export function saveDrawingTemplate(name: string, style: DrawingStyle): DrawingTemplate {
  const list = read().filter((t) => t.name !== name);
  const template: DrawingTemplate = {
    id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    style,
  };
  write([...list, template]);
  return template;
}

export function listDrawingTemplates(): DrawingTemplate[] {
  return read();
}

export function deleteDrawingTemplate(id: string): void {
  write(read().filter((t) => t.id !== id));
}

/** Copy the template's style onto a drawing. False if either side is missing. */
export function applyDrawingTemplate(id: string, drawingId: string): boolean {
  const template = read().find((t) => t.id === id);
  if (!template) return false;
  const chart = useWorkspace.getState().activeChart();
  if (!chart.drawings.some((d) => d.id === drawingId)) return false;
  useWorkspace.getState().updateDrawing(drawingId, { style: { ...template.style } });
  return true;
}
