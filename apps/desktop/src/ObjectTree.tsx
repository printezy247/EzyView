import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Eye, EyeOff, Lock, LockOpen, Pencil, Trash2, Upload, Download, X } from "lucide-react";
import type { Drawing } from "@ezyview/drawing-tools";
import { useWorkspace } from "./store";
import type { ActiveIndicator } from "./store";
import { DrawingProperties } from "./DrawingProperties";
import { parseDrawings, serializeDrawings } from "./drawingsIO";
import { saveBlob } from "./exportUi";

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
 * the order they were drawn. Rows select, hide, lock, rename or delete; the
 * selected drawing's properties panel sits below the tree, with JSON
 * import/export in the footer.
 */
export function ObjectTree({ onClose }: Props) {
  const chart = useWorkspace((s) => s.activeChart());
  const updateDrawing = useWorkspace((s) => s.updateDrawing);
  const removeDrawing = useWorkspace((s) => s.deleteDrawing);
  const selectDrawing = useWorkspace((s) => s.selectDrawing);
  const selectedId = useWorkspace((s) => s.selectedDrawingId);
  const importDrawings = useWorkspace((s) => s.importDrawings);
  const updateIndicator = useWorkspace((s) => s.updateIndicator);
  const updateIndicatorParams = useWorkspace((s) => s.updateIndicatorParams);
  const removeIndicator = useWorkspace((s) => s.removeIndicator);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ioError, setIoError] = useState<string | null>(null);
  const [expandedInd, setExpandedInd] = useState<string | null>(null);

  const empty = chart.indicators.length === 0 && chart.drawings.length === 0;

  const exportDrawings = () => {
    const blob = new Blob([serializeDrawings(chart.drawings)], { type: "application/json" });
    void saveBlob(blob, `drawings-${chart.symbol.replace(/[^A-Za-z0-9._-]/g, "-")}.json`);
    setIoError(null);
  };

  const importFile = async (file: File) => {
    const res = parseDrawings(await file.text());
    if (!res.ok) {
      setIoError(res.error);
      return;
    }
    setIoError(null);
    importDrawings(res.drawings);
  };

  return (
    <aside aria-label="Object tree" className="flex w-full min-w-0 flex-1 flex-col bg-ev-bg">
      <div className="flex items-center justify-between border-b border-ev-raised px-3 py-2">
        <h2 className="text-base font-semibold uppercase tracking-wider text-ev-muted">Object tree</h2>
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

      <div className="min-h-0 flex-1 overflow-y-auto py-1 text-base">
        <p className="truncate px-3 pb-1 text-dense text-ev-muted">
          {chart.symbol} · {chart.resolution}
        </p>
        {empty && (
          <p className="px-3 py-4 text-dense leading-relaxed text-ev-muted">
            Nothing on this chart yet. Add an indicator from Studies, or pick a tool on the left rail.
          </p>
        )}

        {chart.indicators.length > 0 && (
          <Section title="Indicators">
            {chart.indicators.map((i) => (
              <div key={i.uid}>
                <Row
                  label={indicatorLabel(i)}
                  hidden={!!i.hidden}
                  selected={expandedInd === i.uid}
                  onSelect={() => setExpandedInd((prev) => (prev === i.uid ? null : i.uid))}
                  onToggle={() => updateIndicator(i.uid, { hidden: !i.hidden })}
                  onRename={(name) => updateIndicator(i.uid, { name: name || undefined })}
                  onDelete={() => removeIndicator(i.uid)}
                />
                {expandedInd === i.uid && i.def.params.length > 0 && (
                  <div className="space-y-1 border-b border-ev-raised bg-ev-panel px-3 py-1.5 text-dense">
                    {i.def.params.map((p) => (
                      <label key={p.id} className="flex items-center justify-between gap-2 text-ev-muted">
                        <span>{p.label}</span>
                        {p.type === "int" || p.type === "float" ? (
                          <input
                            type="number"
                            value={Number(i.params[p.id] ?? p.default)}
                            min={p.min}
                            max={p.max}
                            step={p.type === "float" ? 0.1 : 1}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (Number.isFinite(val)) updateIndicatorParams(i.uid, { [p.id]: val });
                            }}
                            className="w-16 rounded border border-ev-line bg-ev-bg px-1.5 py-0.5 text-right num text-ev-strong"
                          />
                        ) : p.type === "bool" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(i.params[p.id] ?? p.default)}
                            onChange={(e) => updateIndicatorParams(i.uid, { [p.id]: e.target.checked })}
                          />
                        ) : (
                          <select
                            value={String(i.params[p.id] ?? p.default)}
                            onChange={(e) => updateIndicatorParams(i.uid, { [p.id]: e.target.value })}
                            className="rounded border border-ev-line bg-ev-bg px-1 py-0.5 text-ev-strong"
                          >
                            {["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"].map((src) => (
                              <option key={src} value={src}>
                                {src}
                              </option>
                            ))}
                          </select>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
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
                selected={selectedId === d.id}
                locked={!!d.locked}
                onSelect={() => selectDrawing(d.id)}
                onToggle={() => updateDrawing(d.id, { hidden: !d.hidden })}
                onLock={() => updateDrawing(d.id, { locked: !d.locked })}
                onRename={(name) => updateDrawing(d.id, { name: name || undefined })}
                onDelete={() => removeDrawing(d.id)}
              />
            ))}
          </Section>
        )}
      </div>

      <DrawingProperties />

      <div className="border-t border-ev-raised px-3 py-2 text-dense">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={chart.drawings.length === 0}
            onClick={exportDrawings}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-ev-line px-2 py-1 text-ev-text hover:bg-ev-raised hover:text-ev-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={12} aria-hidden />
            Export
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-ev-line px-2 py-1 text-ev-text hover:bg-ev-raised hover:text-ev-strong"
          >
            <Upload size={12} aria-hidden />
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            aria-label="Import drawings file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // same file can be picked twice
              if (file) void importFile(file);
            }}
          />
        </div>
        {ioError && (
          <p role="alert" className="mt-1.5 text-ev-down">
            {ioError}
          </p>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-1">
      <h3 className="px-3 py-1 text-dense font-semibold uppercase tracking-wider text-ev-faint">{title}</h3>
      <ul>{children}</ul>
    </section>
  );
}

interface RowProps {
  label: string;
  swatch?: string;
  hidden: boolean;
  /** Drawings only: this row is the current selection. */
  selected?: boolean;
  locked?: boolean;
  onSelect?: () => void;
  onToggle: () => void;
  onLock?: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function Row({ label, swatch, hidden, selected, locked, onSelect, onToggle, onLock, onRename, onDelete }: RowProps) {
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
    <li
      aria-selected={selected}
      onClick={onSelect}
      className={`flex h-7 items-center gap-1.5 px-3 hover:bg-ev-panel ${
        selected ? "bg-ev-raised ring-1 ring-inset ring-ev-accent" : ""
      }`}
    >
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
          className="min-w-0 flex-1 rounded bg-ev-panel px-1 py-0.5 text-base text-ev-strong outline-none ring-1 ring-ev-accent"
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
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={iconBtn}
      >
        {hidden ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
      </button>
      {onLock && (
        <button
          type="button"
          aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
          aria-pressed={locked}
          title={locked ? "Unlock" : "Lock"}
          onClick={(e) => {
            e.stopPropagation();
            onLock();
          }}
          className={iconBtn}
        >
          {locked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
        </button>
      )}
      <button
        type="button"
        aria-label={`Rename ${label}`}
        title="Rename"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(label);
          setEditing(true);
        }}
        className={iconBtn}
      >
        <Pencil size={12} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Delete ${label}`}
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={iconBtn}
      >
        <Trash2 size={12} aria-hidden />
      </button>
    </li>
  );
}
