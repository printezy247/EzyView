import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  Bookmark,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Lock,
  LockOpen,
  Settings,
  SlidersHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import {
  isPositionTool,
  toolHasFill,
  toolShowsText,
  toolSpec,
  type DrawingStyle,
} from "@ezyview/drawing-tools";
import { useWorkspace } from "./store";
import { useDrawingUi } from "./drawingUi";
import {
  applyDrawingTemplate,
  listDrawingTemplates,
  saveDrawingTemplate,
  type DrawingTemplate,
} from "./drawingTemplates";
import { drawingLabel } from "./ObjectTree";
import type { DrawingBox } from "./ChartHost";
import { Select } from "./ui";

/** TradingView's stroke palette, plus white for dark themes. */
const PALETTE = ["#2962ff", "#089981", "#f23645", "#ff9800", "#e91e63", "#9c27b0", "#00bcd4", "#ffeb3b", "#ffffff", "#787b86"];
const WIDTHS = [1, 2, 3, 4] as const;
const LINE_STYLES = [
  { id: "solid", label: "Solid", dash: "" },
  { id: "dashed", label: "Dashed", dash: "6 4" },
  { id: "dotted", label: "Dotted", dash: "2 3" },
] as const;

type MenuId = "template" | "color" | "fill" | "text" | "line" | "layers" | null;

interface Props {
  /** Screen box of the selected drawing, relative to the chart container. */
  anchor: DrawingBox | null;
}

/**
 * The floating bar TradingView shows when a drawing is selected.
 *
 * It floats near the drawing (or top-centre when the box is off-screen), can be
 * dragged anywhere inside the chart and pinned there, and exposes the quick
 * actions that do not need the full settings dialog: colour, fill, line style,
 * templates, order, lock/hide/clone/delete and a gear that opens the dialog.
 */
export function FloatingDrawingBar({ anchor }: Props) {
  const drawing = useWorkspace((s) => {
    const id = s.selectedDrawingId;
    if (!id) return null;
    return s.activeChart().drawings.find((d) => d.id === id) ?? null;
  });
  const update = useWorkspace((s) => s.updateDrawing);
  const remove = useWorkspace((s) => s.deleteDrawing);
  const duplicate = useWorkspace((s) => s.duplicateDrawing);
  const move = useWorkspace((s) => s.moveDrawing);
  const addAlert = useWorkspace((s) => s.addAlert);
  const alerts = useWorkspace((s) => s.alerts);
  const pinned = useDrawingUi((s) => s.miniBarPinned);
  const setPinned = useDrawingUi((s) => s.setMiniBarPinned);
  const openSettings = useDrawingUi((s) => s.openSettings);
  const textEditId = useDrawingUi((s) => s.textEditId);
  const requestTextEdit = useDrawingUi((s) => s.requestTextEdit);

  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [menu, setMenu] = useState<MenuId>(null);
  const [templates, setTemplates] = useState<DrawingTemplate[]>(() => listDrawingTemplates());
  const [templateName, setTemplateName] = useState("");
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // Keep the text draft in step with whichever drawing is selected.
  useEffect(() => {
    setText(drawing?.text ?? "");
    setMenu(null);
  }, [drawing?.id, drawing?.text]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const bar = barRef.current;
    if (!wrap || !bar) return;
    const nextBox = { w: bar.offsetWidth, h: bar.offsetHeight };
    const nextContainer = { w: wrap.clientWidth, h: wrap.clientHeight };
    setBox((prev) => (prev.w === nextBox.w && prev.h === nextBox.h ? prev : nextBox));
    setContainer((prev) => (prev.w === nextContainer.w && prev.h === nextContainer.h ? prev : nextContainer));
  });

  if (!drawing) return null;

  const style = drawing.style;
  const spec = toolSpec(drawing.tool);
  const level = drawing.points[0]?.price;
  const canAlert = (drawing.tool === "horizontal_line" || drawing.tool === "horizontal_ray") && level !== undefined;
  const alertBound = alerts.some((a) => a.drawingId === drawing.id);

  const clampX = (x: number) => Math.max(8, Math.min(x, Math.max(8, container.w - box.w - 8)));
  const clampY = (y: number) => Math.max(8, Math.min(y, Math.max(8, container.h - box.h - 8)));
  const autoX = anchor ? anchor.x + anchor.w / 2 - box.w / 2 : container.w / 2 - box.w / 2;
  const autoY = anchor ? anchor.y - box.h - 10 : 12;
  const pos = pinned ? { x: clampX(pinned.x), y: clampY(pinned.y) } : { x: clampX(autoX), y: clampY(autoY) };

  const patchStyle = (patch: Partial<DrawingStyle>) => update(drawing.id, { style: { ...style, ...patch } });

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    e.preventDefault();
  };

  const onDragMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPinned({ x: clampX(e.clientX - drag.dx), y: clampY(e.clientY - drag.dy) });
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const commitText = () => {
    if ((drawing.text ?? "") !== text) update(drawing.id, { text });
    requestTextEdit(null);
  };

  const toggle = (id: Exclude<MenuId, null>) => setMenu((cur) => (cur === id ? null : id));

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <div
        ref={barRef}
        role="toolbar"
        aria-label={`${drawingLabel(drawing)} settings`}
        className={`pointer-events-auto absolute flex items-center gap-0.5 rounded-md border border-ev-line bg-ev-panel/95 px-1 py-0.5 shadow-xl ${
          dragging ? "cursor-grabbing" : ""
        }`}
        style={{ left: pos.x, top: pos.y }}
      >
        <button
          type="button"
          aria-label="Drag drawing toolbar"
          title="Drag"
          onPointerDown={startDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex cursor-grab touch-none items-center rounded px-0.5 text-ev-faint hover:text-ev-strong"
        >
          <GripVertical size={14} aria-hidden />
        </button>

        <BarButton label="Drawing templates" active={menu === "template"} onClick={() => toggle("template")}>
          <Bookmark size={13} aria-hidden />
        </BarButton>

        <BarButton label="Line colour" onClick={() => toggle("color")}>
          <span className="size-3.5 rounded-sm ring-1 ring-ev-line" style={{ background: style.color }} aria-hidden />
        </BarButton>

        {toolHasFill(drawing.tool) && (
          <BarButton label="Fill colour" onClick={() => toggle("fill")}>
            <span
              className="size-3.5 rounded-sm ring-1 ring-ev-line"
              style={{ background: style.fill ?? style.color, opacity: Math.max(0.25, (style.fillOpacity ?? 20) / 100) }}
              aria-hidden
            />
          </BarButton>
        )}

        {toolShowsText(drawing.tool) && (
          <BarButton label="Text settings" active={menu === "text"} onClick={() => toggle("text")}>
            <Type size={13} aria-hidden />
          </BarButton>
        )}

        <BarButton label="Line width and style" active={menu === "line"} onClick={() => toggle("line")}>
          <SlidersHorizontal size={13} aria-hidden />
        </BarButton>

        <BarButton
          label={alertBound ? "Alert armed on this drawing" : "Alert at this level"}
          disabled={!canAlert}
          active={alertBound}
          onClick={() => {
            if (level === undefined) return;
            addAlert(
              useWorkspace.getState().activeChart().symbol,
              { kind: "crossing", value: level },
              "once_per_bar_close",
              `${drawingLabel(drawing)} @ ${level}`,
              drawing.id,
            );
          }}
        >
          <Bell size={13} aria-hidden />
        </BarButton>

        <BarButton label="Drawing settings" onClick={() => openSettings(drawing.id, "style")}>
          <Settings size={13} aria-hidden />
        </BarButton>

        <BarButton label="Visual order" active={menu === "layers"} onClick={() => toggle("layers")}>
          <Layers size={13} aria-hidden />
        </BarButton>

        <BarButton label="Clone drawing" onClick={() => duplicate(drawing.id)}>
          <Copy size={13} aria-hidden />
        </BarButton>

        <BarButton
          label={drawing.locked ? "Unlock drawing" : "Lock drawing"}
          active={!!drawing.locked}
          onClick={() => update(drawing.id, { locked: !drawing.locked })}
        >
          {drawing.locked ? <Lock size={13} aria-hidden /> : <LockOpen size={13} aria-hidden />}
        </BarButton>

        <BarButton
          label={drawing.hidden ? "Show drawing" : "Hide drawing"}
          active={!!drawing.hidden}
          onClick={() => update(drawing.id, { hidden: !drawing.hidden })}
        >
          {drawing.hidden ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
        </BarButton>

        <BarButton label="Delete drawing" danger onClick={() => remove(drawing.id)}>
          <Trash2 size={13} aria-hidden />
        </BarButton>

        {isPositionTool(drawing.tool) && (
          <span className="px-1 text-dense text-ev-faint" aria-hidden>
            {spec.label}
          </span>
        )}

        {menu !== null && (
          <div
            role="dialog"
            aria-label={MENU_TITLES[menu]}
            className="absolute left-0 top-full mt-1 w-56 rounded border border-ev-line bg-ev-panel p-2 shadow-xl"
          >
            {menu === "template" && (
              <div className="space-y-1">
                <p className="text-dense font-medium uppercase tracking-wider text-ev-faint">Template</p>
                {templates.length === 0 && <p className="text-dense text-ev-muted">No templates saved yet.</p>}
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      applyDrawingTemplate(t.id, drawing.id);
                      setMenu(null);
                    }}
                    className="block w-full truncate rounded px-1.5 py-1 text-left text-dense text-ev-text hover:bg-ev-raised"
                  >
                    Apply “{t.name}”
                  </button>
                ))}
                <div className="flex gap-1 border-t border-ev-raised pt-1">
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Save as…"
                    aria-label="Drawing template name"
                    className="min-w-0 flex-1 rounded bg-ev-bg px-1.5 py-0.5 text-dense text-ev-strong outline-none ring-1 ring-ev-line focus:ring-ev-accent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = templateName.trim();
                      if (!name) return;
                      saveDrawingTemplate(name, drawing.style);
                      setTemplates(listDrawingTemplates());
                      setTemplateName("");
                    }}
                    className="rounded border border-ev-line px-2 text-dense text-ev-text hover:bg-ev-raised"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {menu === "color" && (
              <div>
                <p className="mb-1 text-dense font-medium uppercase tracking-wider text-ev-faint">Line colour</p>
                <Palette value={style.color} onPick={(c) => patchStyle({ color: c })} />
                <OpacitySlider label="Opacity" value={style.opacity ?? 100} onChange={(v) => patchStyle({ opacity: v })} />
                <HexInput value={style.color} onCommit={(c) => patchStyle({ color: c })} />
              </div>
            )}

            {menu === "fill" && (
              <div>
                <p className="mb-1 text-dense font-medium uppercase tracking-wider text-ev-faint">Background</p>
                <Palette value={style.fill ?? style.color} onPick={(c) => patchStyle({ fill: c })} />
                <OpacitySlider
                  label="Fill opacity"
                  value={style.fillOpacity ?? 20}
                  onChange={(v) => patchStyle({ fillOpacity: v })}
                />
              </div>
            )}

            {menu === "text" && (
              <div className="space-y-2">
                <p className="text-dense font-medium uppercase tracking-wider text-ev-faint">Text</p>
                <div className="flex items-center justify-between gap-2 text-dense text-ev-muted">
                  <span>Size</span>
                  <Select
                    label="Text size"
                    size="sm"
                    className="w-20"
                    value={String(style.fontSize ?? 13)}
                    onChange={(v) => patchStyle({ fontSize: Number(v) })}
                    options={[10, 12, 13, 14, 16, 20, 24, 32].map((s) => ({ value: String(s), label: `${s}px` }))}
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Bold text"
                    aria-pressed={style.fontWeight === "bold"}
                    onClick={() => patchStyle({ fontWeight: style.fontWeight === "bold" ? "normal" : "bold" })}
                    className={`rounded border border-ev-line px-2 text-dense font-bold ${style.fontWeight === "bold" ? "bg-ev-raised text-ev-strong" : "text-ev-muted"}`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    aria-label="Italic text"
                    aria-pressed={style.fontStyle === "italic"}
                    onClick={() => patchStyle({ fontStyle: style.fontStyle === "italic" ? "normal" : "italic" })}
                    className={`rounded border border-ev-line px-2 text-dense italic ${style.fontStyle === "italic" ? "bg-ev-raised text-ev-strong" : "text-ev-muted"}`}
                  >
                    I
                  </button>
                </div>
                <Palette value={style.textColor ?? style.color} onPick={(c) => patchStyle({ textColor: c })} />
              </div>
            )}

            {menu === "line" && (
              <div>
                <p className="mb-1 text-dense font-medium uppercase tracking-wider text-ev-faint">Line</p>
                <div className="mb-1 flex gap-1">
                  {WIDTHS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      aria-label={`Width ${w}`}
                      aria-pressed={style.width === w}
                      onClick={() => patchStyle({ width: w })}
                      className={`flex h-6 w-7 items-center justify-center rounded border text-dense ${
                        style.width === w ? "border-ev-accent bg-ev-raised text-ev-strong" : "border-ev-line text-ev-muted"
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                {LINE_STYLES.map((ls) => (
                  <button
                    key={ls.id}
                    type="button"
                    aria-label={`Line style ${ls.label}`}
                    aria-pressed={style.lineStyle === ls.id}
                    onClick={() => patchStyle({ lineStyle: ls.id })}
                    className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left text-dense ${
                      style.lineStyle === ls.id ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:bg-ev-raised"
                    }`}
                  >
                    <svg width="42" height="8" aria-hidden>
                      <line
                        x1="1"
                        y1="4"
                        x2="41"
                        y2="4"
                        stroke="currentColor"
                        strokeWidth={Math.min(style.width, 4)}
                        strokeDasharray={ls.dash}
                      />
                    </svg>
                    {ls.label}
                  </button>
                ))}
              </div>
            )}

            {menu === "layers" && (
              <div className="space-y-0.5">
                <p className="text-dense font-medium uppercase tracking-wider text-ev-faint">Visual order</p>
                {(
                  [
                    ["front", "Bring to front"],
                    ["forward", "Bring forward"],
                    ["backward", "Send backward"],
                    ["back", "Send to back"],
                  ] as const
                ).map(([to, label]) => (
                  <button
                    key={to}
                    type="button"
                    onClick={() => {
                      move(drawing.id, to);
                      setMenu(null);
                    }}
                    className="block w-full rounded px-1.5 py-1 text-left text-dense text-ev-text hover:bg-ev-raised"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {textEditId === drawing.id && (
        <div
          className="pointer-events-auto absolute z-40 flex items-center gap-1 rounded border border-ev-line bg-ev-panel p-1 shadow-xl"
          style={{ left: pos.x, top: Math.min(container.h - 34, pos.y + box.h + 4) }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText();
              if (e.key === "Escape") {
                setText(drawing.text ?? "");
                requestTextEdit(null);
                e.stopPropagation();
              }
            }}
            onBlur={commitText}
            aria-label="Drawing text"
            placeholder="Type text…"
            className="w-48 rounded bg-ev-bg px-1.5 py-0.5 text-base text-ev-strong outline-none ring-1 ring-ev-line focus:ring-ev-accent"
          />
          <button
            type="button"
            onClick={commitText}
            className="rounded bg-ev-accent px-2 py-0.5 text-dense text-white"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

const MENU_TITLES: Record<Exclude<MenuId, null>, string> = {
  template: "Drawing templates",
  color: "Line colour",
  fill: "Background colour",
  text: "Text settings",
  line: "Line width and style",
  layers: "Visual order",
};

function BarButton({
  label,
  children,
  onClick,
  active,
  disabled,
  danger,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-7 shrink-0 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-ev-raised text-ev-accent-text" : ""
      } ${danger ? "hover:text-ev-down-text" : ""}`}
    >
      {children}
    </button>
  );
}

function Palette({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Colour ${c}`}
          aria-pressed={value.toLowerCase() === c}
          onClick={() => onPick(c)}
          className={`size-4 rounded-full ring-1 ${value.toLowerCase() === c ? "ring-2 ring-ev-accent" : "ring-ev-line"}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function OpacitySlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mb-1.5 block text-dense text-ev-muted">
      <span className="flex items-center justify-between">
        {label}
        <span className="num">{Math.round(value)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-ev-accent"
      />
    </label>
  );
}

function HexInput({ value, onCommit }: { value: string; onCommit: (color: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex items-center gap-1">
      <input
        type="color"
        value={normaliseHex(value)}
        aria-label="Custom colour picker"
        onChange={(e) => onCommit(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-ev-line bg-ev-bg"
      />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (/^#[0-9a-f]{3,8}$/i.test(draft)) onCommit(draft);
          else setDraft(value);
        }}
        aria-label="Custom colour hex"
        className="min-w-0 flex-1 rounded bg-ev-bg px-1 py-0.5 text-dense text-ev-strong outline-none ring-1 ring-ev-line focus:ring-ev-accent"
      />
    </div>
  );
}

/** `<input type=color>` only accepts #rrggbb; expand short hex or fall back. */
function normaliseHex(color: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#2962ff";
}

