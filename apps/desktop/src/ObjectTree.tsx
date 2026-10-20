import { useState } from "react";
import type { ReactNode } from "react";
import { Eye, EyeOff, Pencil, Trash2, X } from "lucide-react";
import type { Drawing } from "@ezyview/drawing-tools";
import { useWorkspace } from "./store";
import type { ActiveIndicator } from "./store";

interface Props {
  onClose: () => void;
}

/** "trend_line" → "Trend line". */
export const toolName = (tool: string): string => {
  const words = tool.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const drawingLabel = (d: Drawing): string => d.name ?? toolName(d.tool);
export const indicatorLabel = (i: ActiveIndicator): string => i.name ?? i.def.name;

/**
 * Everything placed on the focused chart: indicators first, then drawings in
 * the order they were drawn. Each row can be hidden, renamed or deleted.
 */
export function ObjectTree({ onClose }: Props) {
  const chart = useWorkspace((s) => s.activeChart());
  const updateDrawing = useWorkspace((s) => s.updateDrawing);
  const setDrawings = useWorkspace((s) => s.setDrawings);
  const updateIndicator = useWorkspace((s) => s.updateIndicator);
  const removeIndicator = useWorkspace((s) => s.removeIndicator);

  const empty = chart.indicators.length === 0 && chart.drawings.length === 0;

  return (
    <aside aria-label="Object tree" className="flex w-56 shrink-0 flex-col border-l border-ev-raised bg-ev-bg">
      <div className="flex items-center justify-between border-b border-ev-raised px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ev-muted">Object tree</h2>
        <button
          type="button"
          aria-label="Close object tree"
          title="Close"
          onClick={onClose}
          className="flex size-5 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <X size={13} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 text-xs">
        <p className="truncate px-3 pb-1 text-[11px] text-ev-muted">
          {chart.symbol} · {chart.resolution}
        </p>
        {empty && (
          <p className="px-3 py-4 text-[11px] leading-relaxed text-ev-muted">
            Nothing on this chart yet. Add an indicator from Studies, or pick a tool on the left rail.
          </p>
        )}

        {chart.indicators.length > 0 && (
          <Section title="Indicators">
            {chart.indicators.map((i) => (
              <Row
                key={i.uid}
                label={indicatorLabel(i)}
                hidden={!!i.hidden}
                onToggle={() => updateIndicator(i.uid, { hidden: !i.hidden })}
                onRename={(name) => updateIndicator(i.uid, { name: name || undefined })}
                onDelete={() => removeIndicator(i.uid)}
              />
            ))}
          </Section>
        )}

        {chart.drawings.length > 0 && (
          <Section title="Drawings">
            {chart.drawings.map((d) => (
              <Row
                key={d.id}
                label={drawingLabel(d)}
                swatch={d.style.color}
                hidden={!!d.hidden}
                onToggle={() => updateDrawing(d.id, { hidden: !d.hidden })}
                onRename={(name) => updateDrawing(d.id, { name: name || undefined })}
                onDelete={() => setDrawings(chart.drawings.filter((x) => x.id !== d.id))}
              />
            ))}
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-1">
      <h3 className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ev-faint">{title}</h3>
      <ul>{children}</ul>
    </section>
  );
}

interface RowProps {
  label: string;
  swatch?: string;
  hidden: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function Row({ label, swatch, hidden, onToggle, onRename, onDelete }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name !== label) onRename(name);
  };

  const iconBtn =
    "flex size-5 shrink-0 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong";

  return (
    <li className="flex h-7 items-center gap-1.5 px-3 hover:bg-ev-panel">
      {swatch && <span className="size-2 shrink-0 rounded-full" style={{ background: swatch }} aria-hidden />}
      {editing ? (
        <input
          aria-label={`Rename ${label}`}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(label);
              setEditing(false);
            }
            // Keep Escape from also disarming the drawing tool.
            e.stopPropagation();
          }}
          className="min-w-0 flex-1 rounded bg-ev-panel px-1 py-0.5 text-xs text-ev-strong outline-none ring-1 ring-ev-accent"
        />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate ${hidden ? "text-ev-faint line-through" : "text-ev-text"}`}
          onDoubleClick={() => {
            setDraft(label);
            setEditing(true);
          }}
          title="Double-click to rename"
        >
          {label}
        </span>
      )}
      <button
        type="button"
        aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
        aria-pressed={hidden}
        title={hidden ? "Show" : "Hide"}
        onClick={onToggle}
        className={iconBtn}
      >
        {hidden ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
      </button>
      <button
        type="button"
        aria-label={`Rename ${label}`}
        title="Rename"
        onClick={() => {
          setDraft(label);
          setEditing(true);
        }}
        className={iconBtn}
      >
        <Pencil size={12} aria-hidden />
      </button>
      <button type="button" aria-label={`Delete ${label}`} title="Delete" onClick={onDelete} className={iconBtn}>
        <Trash2 size={12} aria-hidden />
      </button>
    </li>
  );
}
