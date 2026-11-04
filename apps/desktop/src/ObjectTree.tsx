import { useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, LockOpen, Pencil, Search, Trash2, Upload, Download, X } from "lucide-react";
import type { Drawing } from "@ezyview/drawing-tools";
import { useWorkspace } from "./store";
import type { ActiveIndicator } from "./store";
import { DrawingProperties } from "./DrawingProperties";
import { parseDrawings, serializeDrawings } from "./drawingsIO";
import { saveBlob } from "./exportUi";
import { Button, Checkbox, IconButton, Input, Select } from "./ui";

interface Props {
  onClose: () => void;
}

/** Price sources an indicator's string parameter can be computed from. */
const SOURCE_OPTIONS = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"].map((src) => ({ value: src, label: src }));

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
  const toggleDrawingSelection = useWorkspace((s) => s.toggleDrawingSelection);
  const setDrawingSelection = useWorkspace((s) => s.setDrawingSelection);
  const updateDrawings = useWorkspace((s) => s.updateDrawings);
  const deleteDrawings = useWorkspace((s) => s.deleteDrawings);
  const groupSelectedDrawings = useWorkspace((s) => s.groupSelectedDrawings);
  const ungroupSelectedDrawings = useWorkspace((s) => s.ungroupSelectedDrawings);
  const selectedIds = useWorkspace((s) => s.selectedDrawingIds);
  const importDrawings = useWorkspace((s) => s.importDrawings);
  const updateIndicator = useWorkspace((s) => s.updateIndicator);
  const updateIndicatorParams = useWorkspace((s) => s.updateIndicatorParams);
  const removeIndicator = useWorkspace((s) => s.removeIndicator);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ioError, setIoError] = useState<string | null>(null);
  const [expandedInd, setExpandedInd] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const empty = chart.indicators.length === 0 && chart.drawings.length === 0;
  const needle = query.trim().toLowerCase();
  const filteredDrawings = needle
    ? chart.drawings.filter((d) => `${drawingLabel(d)} ${d.tool}`.toLowerCase().includes(needle))
    : chart.drawings;
  const grouped = new Map<string, Drawing[]>();
  const loose: Drawing[] = [];
  for (const drawing of filteredDrawings) {
    if (!drawing.groupId) {
      loose.push(drawing);
      continue;
    }
    const list = grouped.get(drawing.groupId) ?? [];
    list.push(drawing);
    grouped.set(drawing.groupId, list);
  }

  const exportDrawings = () => {
    const blob = new Blob([serializeDrawings(chart.drawings)], { type: "application/json" });
    void saveBlob(blob, `drawings-${chart.symbol.replace(/[^A-Za-z0-9._-]/g, "-")}.json`);
    setIoError(null);
  };

  const importFile = async (file: File) => {
    try {
      const res = parseDrawings(await file.text());
      if (!res.ok) {
        setIoError(res.error);
        return;
      }
      setIoError(null);
      importDrawings(res.drawings);
    } catch (err) {
      setIoError(err instanceof Error ? err.message : "Could not read the file.");
    }
  };

  return (
    <aside aria-label="Object tree" className="flex w-full min-w-0 flex-1 flex-col bg-ev-bg">
      <div className="flex items-center justify-between border-b border-ev-raised px-3 py-2">
        <h2 className="text-base font-semibold uppercase tracking-wider text-ev-muted">Object tree</h2>
        <IconButton label="Close object tree" size="sm" onClick={onClose}>
          <X size={13} aria-hidden />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 text-base" role="tree" aria-label="Chart objects">
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
                      <div key={p.id} className="flex items-center justify-between gap-2 text-ev-muted">
                        <span>{p.label}</span>
                        {p.type === "int" || p.type === "float" ? (
                          <Input
                            type="number"
                            value={Number(i.params[p.id] ?? p.default)}
                            min={p.min}
                            max={p.max}
                            step={p.type === "float" ? 0.1 : 1}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (Number.isFinite(val)) updateIndicatorParams(i.uid, { ...i.params, [p.id]: val });
                            }}
                            aria-label={p.label}
                            className="w-16 text-right num"
                          />
                        ) : p.type === "bool" ? (
                          <Checkbox
                            label={p.label}
                            checked={Boolean(i.params[p.id] ?? p.default)}
                            onChange={(checked) => updateIndicatorParams(i.uid, { ...i.params, [p.id]: checked })}
                          />
                        ) : (
                          <Select
                            label={p.label}
                            size="sm"
                            value={String(i.params[p.id] ?? p.default)}
                            onChange={(value) => updateIndicatorParams(i.uid, { ...i.params, [p.id]: value })}
                            options={SOURCE_OPTIONS}
                            className="shrink-0"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}

        {chart.drawings.length > 0 && (
          <Section title="Drawings">
            <div className="flex items-center gap-1 px-3 pb-1.5">
              <Search size={12} aria-hidden className="shrink-0 text-ev-faint" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter objects"
                aria-label="Filter objects"
                className="min-w-0 flex-1"
              />
            </div>
            {selectedIds.length > 1 && (
              <div className="mx-2 mb-1.5 flex flex-wrap items-center gap-1 rounded border border-ev-accent/40 bg-ev-accent/10 px-1.5 py-1 text-dense">
                <span className="mr-auto text-ev-accent-text">{selectedIds.length} selected</span>
                <Button variant="ghost" size="sm" onClick={() => groupSelectedDrawings()}>
                  Group
                </Button>
                <Button variant="ghost" size="sm" onClick={() => ungroupSelectedDrawings()}>
                  Ungroup
                </Button>
                <Button variant="ghost" size="sm" onClick={() => updateDrawings(selectedIds, { hidden: true })}>
                  Hide
                </Button>
                <Button variant="ghost" size="sm" onClick={() => updateDrawings(selectedIds, { locked: true })}>
                  Lock
                </Button>
                <Button variant="ghost" size="sm" onClick={() => updateDrawings(selectedIds, { zIndex: Math.max(0, ...chart.drawings.map((d) => d.zIndex ?? 0)) + 1 })}>
                  Front
                </Button>
                <Button variant="ghost" size="sm" onClick={() => updateDrawings(selectedIds, { zIndex: Math.min(0, ...chart.drawings.map((d) => d.zIndex ?? 0)) - 1 })}>
                  Back
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteDrawings(selectedIds)} className="text-ev-down-text">
                  Delete
                </Button>
              </div>
            )}
            {[...grouped.entries()].map(([groupId, list]) => {
              const open = !collapsedGroups[groupId];
              const anyHidden = list.every((d) => d.hidden);
              const anyLocked = list.every((d) => d.locked);
              const ids = list.map((d) => d.id);
              return (
                <div key={groupId}>
                  <div className="flex h-7 items-center gap-1 bg-ev-panel/60 px-2 text-dense">
                    <IconButton
                      label={open ? "Collapse group" : "Expand group"}
                      size="sm"
                      aria-expanded={open}
                      onClick={() => setCollapsedGroups((prev) => ({ ...prev, [groupId]: open }))}
                      className="size-5"
                    >
                      {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
                    </IconButton>
                    <Button variant="ghost" size="sm" onClick={() => setDrawingSelection(ids)} className="min-w-0 flex-1 justify-start truncate font-medium">
                      Group · {list.length}
                    </Button>
                    <IconButton label="Toggle group visibility" size="sm" onClick={() => updateDrawings(ids, { hidden: !anyHidden })} className="size-5">
                      {anyHidden ? <EyeOff size={11} aria-hidden /> : <Eye size={11} aria-hidden />}
                    </IconButton>
                    <IconButton label="Toggle group lock" size="sm" onClick={() => updateDrawings(ids, { locked: !anyLocked })} className="size-5">
                      {anyLocked ? <Lock size={11} aria-hidden /> : <LockOpen size={11} aria-hidden />}
                    </IconButton>
                    <IconButton label="Delete group" size="sm" onClick={() => deleteDrawings(ids)} className="size-5 hover:text-ev-down-text">
                      <Trash2 size={11} aria-hidden />
                    </IconButton>
                  </div>
                  {open &&
                    list.map((d) => (
                      <Row
                        key={d.id}
                        label={drawingLabel(d)}
                        swatch={d.style.color}
                        hidden={!!d.hidden}
                        selected={selectedIds.includes(d.id)}
                        locked={!!d.locked}
                        grouped
                        onSelect={(e) => (e?.shiftKey ? toggleDrawingSelection(d.id) : selectDrawing(d.id))}
                        onToggle={() => updateDrawing(d.id, { hidden: !d.hidden })}
                        onLock={() => updateDrawing(d.id, { locked: !d.locked })}
                        onRename={(name) => updateDrawing(d.id, { name: name || undefined })}
                        onDelete={() => removeDrawing(d.id)}
                      />
                    ))}
                </div>
              );
            })}
            {loose.map((d) => (
              <Row
                key={d.id}
                label={drawingLabel(d)}
                swatch={d.style.color}
                hidden={!!d.hidden}
                selected={selectedIds.includes(d.id)}
                locked={!!d.locked}
                onSelect={(e) => (e?.shiftKey ? toggleDrawingSelection(d.id) : selectDrawing(d.id))}
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
          <Button variant="outline" size="sm" disabled={chart.drawings.length === 0} onClick={exportDrawings} className="flex-1">
            <Download size={12} aria-hidden />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="flex-1">
            <Upload size={12} aria-hidden />
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            aria-label="Import drawings file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // same file can be picked twice
              if (file) void importFile(file).catch(() => setIoError("Could not read the file."));
            }}
          />
        </div>
        {ioError && (
          <p role="alert" className="mt-1.5 text-ev-down-text">
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
  /** Child of a group: indent the row under its group header. */
  grouped?: boolean;
  onSelect?: (event?: MouseEvent) => void;
  onToggle: () => void;
  onLock?: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function Row({ label, swatch, hidden, selected, locked, grouped, onSelect, onToggle, onLock, onRename, onDelete }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name !== label) onRename(name);
  };

  return (
    <li
      aria-current={selected ? "true" : undefined}
      onClick={(e) => onSelect?.(e)}
      onKeyDown={(e) => {
        // The row selects a drawing, so it must be reachable by keyboard.
        if ((e.key === "Enter" || e.key === " ") && onSelect) {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="treeitem"
      aria-selected={selected ?? false}
      aria-label={label}
      className={`flex h-7 items-center gap-1.5 ${grouped ? "pl-7 pr-3" : "px-3"} hover:bg-ev-panel ${
        selected ? "bg-ev-raised ring-1 ring-inset ring-ev-accent" : ""
      }`}
    >
      {swatch && <span className="size-2 shrink-0 rounded-full" style={{ background: swatch }} aria-hidden />}
      {editing ? (
        <Input
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
          className="min-w-0 flex-1"
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
      <IconButton
        label={hidden ? `Show ${label}` : `Hide ${label}`}
        aria-pressed={hidden}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        size="sm"
        className="size-6"
      >
        {hidden ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
      </IconButton>
      {onLock && (
        <IconButton
          label={locked ? `Unlock ${label}` : `Lock ${label}`}
          aria-pressed={locked}
          onClick={(e) => {
            e.stopPropagation();
            onLock();
          }}
          size="sm"
          className="size-6"
        >
          {locked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
        </IconButton>
      )}
      <IconButton
        label={`Rename ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(label);
          setEditing(true);
        }}
        size="sm"
          className="size-6"
      >
        <Pencil size={12} aria-hidden />
      </IconButton>
      <IconButton
        label={`Delete ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        size="sm"
          className="size-6"
      >
        <Trash2 size={12} aria-hidden />
      </IconButton>
    </li>
  );
}
