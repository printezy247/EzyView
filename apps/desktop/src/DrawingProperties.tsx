import { useState } from "react";
import { Bell, Eye, EyeOff, Lock, LockOpen, Trash2 } from "lucide-react";
import { useWorkspace } from "./store";
import { drawingLabel } from "./ObjectTree";
import { applyDrawingTemplate, listDrawingTemplates, saveDrawingTemplate } from "./drawingTemplates";
import type { DrawingTemplate } from "./drawingTemplates";

const COLORS = ["#d91400", "#0ea600", "#f2a93b", "#4a90e2", "#9c27b0", "#00bcd4", "#ffd700", "#ffffff"];
const WIDTHS = [1, 2, 3, 4];
const LINE_STYLES = ["solid", "dashed", "dotted"] as const;

/**
 * Edit panel for the selected drawing. Every field goes through
 * `updateDrawing`, so each change is one undo step.
 */
export function DrawingProperties() {
  const drawing = useWorkspace((s) => {
    const id = s.selectedDrawingId;
    if (!id) return null;
    return s.activeChart().drawings.find((d) => d.id === id) ?? null;
  });
  const update = useWorkspace((s) => s.updateDrawing);
  const setDrawings = useWorkspace((s) => s.setDrawings);
  const remove = useWorkspace((s) => s.deleteDrawing);
  const addAlert = useWorkspace((s) => s.addAlert);
  const alerts = useWorkspace((s) => s.alerts);

  // Templates live in localStorage, so the list is local state refreshed on
  // save — the store has nothing to notify about.
  const [templates, setTemplates] = useState<DrawingTemplate[]>(() => listDrawingTemplates());
  const [templateName, setTemplateName] = useState("");

  if (!drawing) return null;
  const d = drawing;
  const style = d.style;
  const level = d.points[0]?.price;
  const canAlert = d.tool === "horizontal_line" && level !== undefined && Number.isFinite(level);
  const alertBound = alerts.some((a) => a.drawingId === d.id);

  const btn =
    "rounded border border-ev-line px-2 py-1 text-dense text-ev-text hover:bg-ev-raised hover:text-ev-strong";

  const reorder = (to: "front" | "back") => {
    const chart = useWorkspace.getState().activeLayout();
    const idx = chart.activeChart;
    const drawings = chart.charts[idx]?.drawings ?? [];
    const rest = drawings.filter((x) => x.id !== d.id);
    setDrawings(to === "front" ? [...rest, d] : [d, ...rest], idx);
  };

  return (
    <div className="border-t border-ev-raised px-3 py-2 text-base" aria-label="Drawing properties">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-dense font-semibold uppercase tracking-wider text-ev-faint">Properties</h3>
        <span className="truncate text-dense text-ev-muted">{drawingLabel(d)}</span>
      </div>

      <label className="mb-2 block">
        <span className="mb-1 block text-dense text-ev-muted">Name</span>
        <input
          value={d.name ?? ""}
          placeholder={drawingLabel(d)}
          onChange={(e) => update(d.id, { name: e.target.value || undefined })}
          className="w-full rounded bg-ev-panel px-1.5 py-1 text-base text-ev-strong outline-none ring-1 ring-ev-line focus:ring-ev-accent"
        />
      </label>

      <div className="mb-2">
        <span className="mb-1 block text-dense text-ev-muted">Colour</span>
        <div className="flex flex-wrap gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={style.color === c}
              onClick={() => update(d.id, { style: { ...style, color: c } })}
              className={`size-5 rounded-full ring-1 ${style.color === c ? "ring-2 ring-ev-accent" : "ring-ev-line"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <div className="mb-2 flex gap-3">
        <div>
          <span className="mb-1 block text-dense text-ev-muted">Width</span>
          <div className="flex gap-1">
            {WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-label={`Width ${w}`}
                aria-pressed={style.width === w}
                onClick={() => update(d.id, { style: { ...style, width: w } })}
                className={`${btn} ${style.width === w ? "bg-ev-raised text-ev-strong" : ""}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-dense text-ev-muted">Style</span>
          <div className="flex gap-1">
            {LINE_STYLES.map((ls) => (
              <button
                key={ls}
                type="button"
                aria-label={`Line style ${ls}`}
                aria-pressed={style.lineStyle === ls}
                onClick={() => update(d.id, { style: { ...style, lineStyle: ls } })}
                className={`${btn} ${style.lineStyle === ls ? "bg-ev-raised text-ev-strong" : ""}`}
              >
                {ls.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-2">
        <span className="mb-1 block text-dense text-ev-muted">Template</span>
        <div className="flex gap-1">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value && applyDrawingTemplate(e.target.value, d.id)) {
                setTemplates(listDrawingTemplates());
              }
            }}
            aria-label="Apply drawing template"
            className="rounded border border-ev-line bg-ev-panel px-1.5 py-1 text-base text-ev-text"
          >
            <option value="">Apply…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            value={templateName}
            placeholder="Name"
            onChange={(e) => setTemplateName(e.target.value)}
            aria-label="Template name"
            className="min-w-0 flex-1 rounded bg-ev-panel px-1.5 py-1 text-base text-ev-strong outline-none ring-1 ring-ev-line focus:ring-ev-accent"
          />
          <button
            type="button"
            onClick={() => {
              const name = templateName.trim() || drawingLabel(d);
              saveDrawingTemplate(name, style);
              setTemplateName("");
              setTemplates(listDrawingTemplates());
            }}
            className={btn}
          >
            Save
          </button>
        </div>
      </div>

      {(d.tool === "text" || d.text !== undefined) && (
        <label className="mb-2 block">
          <span className="mb-1 block text-dense text-ev-muted">Text</span>
          <input
            value={d.text ?? ""}
            onChange={(e) => update(d.id, { text: e.target.value })}
            className="w-full rounded bg-ev-panel px-1.5 py-1 text-base text-ev-strong outline-none ring-1 ring-ev-line focus:ring-ev-accent"
          />
        </label>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!!d.locked}
          onClick={() => update(d.id, { locked: !d.locked })}
          className={`${btn} flex items-center gap-1 ${d.locked ? "text-ev-accent" : ""}`}
        >
          {d.locked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
          {d.locked ? "Locked" : "Lock"}
        </button>
        <button
          type="button"
          aria-pressed={!!d.hidden}
          onClick={() => update(d.id, { hidden: !d.hidden })}
          className={`${btn} flex items-center gap-1`}
        >
          {d.hidden ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
          {d.hidden ? "Hidden" : "Visible"}
        </button>
        <button type="button" onClick={() => reorder("front")} className={btn}>
          To front
        </button>
        <button type="button" onClick={() => reorder("back")} className={btn}>
          To back
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canAlert || alertBound}
          title={canAlert ? undefined : "Only a horizontal line can hold a price alert"}
          onClick={() => {
            if (level === undefined) return;
            addAlert(
              useWorkspace.getState().activeChart().symbol,
              { kind: "crossing", value: level },
              "once_per_bar_close",
              `${drawingLabel(d)} @ ${level}`,
              d.id,
            );
          }}
          className={`${btn} flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Bell size={12} aria-hidden />
          {alertBound ? "Alert armed" : "Alert at level"}
        </button>
        <button
          type="button"
          onClick={() => remove(d.id)}
          className={`${btn} flex items-center gap-1 text-ev-down hover:opacity-80`}
        >
          <Trash2 size={12} aria-hidden />
          Delete
        </button>
      </div>
    </div>
  );
}
