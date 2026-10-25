import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  fibLevelStyles,
  isPositionTool,
  TIMEFRAME_UNITS,
  toolHasFill,
  toolShowsStats,
  toolSpec,
  toolSupportsExtend,
  type Drawing,
  type DrawingStyle,
  type DrawingVisibility,
  type FibLevelStyle,
  type Point,
} from "@ezyview/drawing-tools";
import { Modal } from "./Modal";
import { Select } from "./ui";
import { useWorkspace } from "./store";
import { useDrawingUi } from "./drawingUi";
import type { DrawingSettingsTab } from "./drawingUi";
import { listDrawingTemplates, saveDrawingTemplate } from "./drawingTemplates";
import { drawingLabel } from "./ObjectTree";
import { syncPositionDrawingToOrderTicket } from "./orderDraft";

const COLORS = ["#2962ff", "#089981", "#f23645", "#ff9800", "#e91e63", "#9c27b0", "#00bcd4", "#ffeb3b", "#ffffff", "#787b86"];
const WIDTHS = [1, 2, 3, 4] as const;
const FONT_SIZES = [10, 12, 14, 16, 20, 24, 32] as const;

/** Straight tools whose ends can become arrows. */
const ARROW_END_TOOLS = new Set<Drawing["tool"]>(["trend_line", "ray", "extended_line", "horizontal_line", "horizontal_ray", "info_line"]);

const TABS: { id: DrawingSettingsTab; label: string }[] = [
  { id: "style", label: "Style" },
  { id: "text", label: "Text" },
  { id: "coordinates", label: "Coordinates" },
  { id: "visibility", label: "Visibility" },
];

interface Draft {
  style: DrawingStyle;
  text: string;
  points: Point[];
  visibility?: DrawingVisibility;
}

/**
 * The full drawing settings dialog: Style, Text, Coordinates and Visibility
 * tabs with a live preview on the chart.
 *
 * Every edit goes through `previewDrawing` (no undo entry, no history spam).
 * Cancel restores the snapshot taken when the dialog opened; OK closes the
 * preview changes into a single undo entry, the same contract the drag gesture
 * uses.
 */
export function DrawingSettingsModal() {
  const settingsId = useDrawingUi((s) => s.settingsId);
  const settingsTab = useDrawingUi((s) => s.settingsTab);
  const openSettings = useDrawingUi((s) => s.openSettings);
  const closeSettings = useDrawingUi((s) => s.closeSettings);
  const drawing = useWorkspace((s) => {
    if (!settingsId) return null;
    return s.activeChart().drawings.find((d) => d.id === settingsId) ?? null;
  });
  const previewDrawing = useWorkspace((s) => s.previewDrawing);

  const [draft, setDraft] = useState<Draft | null>(null);
  const originalRef = useRef<Drawing | null>(null);
  const previousRef = useRef<Drawing[] | null>(null);

  useEffect(() => {
    if (!settingsId) return;
    const st = useWorkspace.getState();
    const chart = st.activeChart();
    const target = chart.drawings.find((d) => d.id === settingsId) ?? null;
    if (!target) {
      closeSettings();
      return;
    }
    originalRef.current = structuredClone(target);
    previousRef.current = chart.drawings;
    setDraft({
      style: structuredClone(target.style),
      text: target.text ?? "",
      points: target.points.map((p) => ({ ...p })),
      ...(target.visibility ? { visibility: { ...target.visibility } } : {}),
    });
    // Only on open: live previews change the store's drawing identity and must
    // not reset the form under the user's pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsId]);

  if (!settingsId || !drawing || !draft) return null;
  const id = drawing.id;
  const style = draft.style;
  const spec = toolSpec(drawing.tool);

  const applyStyle = (patch: Partial<DrawingStyle>) => {
    const nextStyle = { ...style, ...patch };
    setDraft({ ...draft, style: nextStyle });
    previewDrawing(id, { style: nextStyle });
  };

  const applyPoints = (points: Point[]) => {
    setDraft({ ...draft, points });
    previewDrawing(id, { points });
  };

  const applyText = (text: string) => {
    setDraft({ ...draft, text });
    previewDrawing(id, { text });
  };

  const applyVisibility = (visibility: DrawingVisibility | undefined) => {
    setDraft({ ...draft, visibility });
    previewDrawing(id, { visibility });
  };

  const cancel = () => {
    const original = originalRef.current;
    if (original) {
      previewDrawing(id, {
        style: original.style,
        text: original.text,
        points: original.points,
        visibility: original.visibility,
      });
    }
    setDraft(null);
    closeSettings();
  };

  const ok = () => {
    const st = useWorkspace.getState();
    const changed = originalRef.current !== null && JSON.stringify(draft) !== JSON.stringify({
      style: originalRef.current.style,
      text: originalRef.current.text ?? "",
      points: originalRef.current.points,
      ...(originalRef.current.visibility ? { visibility: originalRef.current.visibility } : {}),
    });
    if (changed && previousRef.current) st.commitDrawingHistory(previousRef.current);
    if (changed) st.rememberDrawingStyle(drawing.tool, draft.style);
    setDraft(null);
    useDrawingUi.getState().requestTextEdit(null);
    closeSettings();
  };

  const labelledBy = "drawing-settings-title";

  return (
    <Modal onClose={cancel} labelledBy={labelledBy} className="flex max-h-[85vh] w-[min(560px,92vw)] flex-col rounded border border-ev-line bg-ev-panel shadow-2xl">
      <div className="flex items-center justify-between border-b border-ev-raised px-4 py-2.5">
        <h2 id={labelledBy} className="text-body font-semibold text-ev-strong">
          {spec.label} Settings
          <span className="ml-2 text-dense font-normal text-ev-faint">{drawingLabel(drawing)}</span>
        </h2>
        <button
          type="button"
          aria-label="Close drawing settings"
          onClick={cancel}
          className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <div role="tablist" aria-label="Drawing settings sections" className="flex gap-1 border-b border-ev-raised px-3 pt-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={settingsTab === tab.id}
            onClick={() => openSettings(id, tab.id)}
            className={`rounded-t px-3 py-1.5 text-dense ${
              settingsTab === tab.id ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:text-ev-strong"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-base">
        {settingsTab === "style" && (
          <StyleTab
            tool={drawing.tool}
            style={style}
            onStyle={applyStyle}
            onApplyToOrder={() =>
              syncPositionDrawingToOrderTicket(
                { tool: drawing.tool, points: draft.points },
                useWorkspace.getState().activeChart().symbol,
              )
            }
          />
        )}
        {settingsTab === "text" && <TextTab text={draft.text} style={style} onText={applyText} onStyle={applyStyle} />}
        {settingsTab === "coordinates" && <CoordinatesTab points={draft.points} onPoints={applyPoints} />}
        {settingsTab === "visibility" && (
          <VisibilityTab visibility={draft.visibility} onChange={applyVisibility} />
        )}
      </div>

      <Footer
        onCancel={cancel}
        onOk={ok}
        onApplyTemplate={(templateId) => {
          const template = listDrawingTemplates().find((t) => t.id === templateId);
          if (!template) return;
          // Applied to the dialog draft, not through updateDrawing: OK should
          // still be the one undo entry for the whole session.
          const nextStyle = structuredClone(template.style);
          setDraft({ ...draft, style: nextStyle });
          previewDrawing(id, { style: nextStyle });
        }}
        onSaveTemplate={(name) => saveDrawingTemplate(name, style)}
      />
    </Modal>
  );
}

function StyleTab({
  tool,
  style,
  onStyle,
  onApplyToOrder,
}: {
  tool: Drawing["tool"];
  style: DrawingStyle;
  onStyle: (patch: Partial<DrawingStyle>) => void;
  onApplyToOrder: () => void;
}) {
  const fib = tool === "fib_retracement" || tool === "fib_extension";
  const position = isPositionTool(tool);
  const levels = fib ? fibLevelStyles(style) : null;

  return (
    <div className="space-y-4">
      <Section title={fib ? "Levels" : "Line"}>
        <ColorRow label="Colour" value={style.color} onChange={(color) => onStyle({ color })} />
        <Slider label="Opacity" value={style.opacity ?? 100} onChange={(opacity) => onStyle({ opacity })} />
        <div className="flex items-center gap-2">
          <span className="w-28 text-dense text-ev-muted">Thickness</span>
          {WIDTHS.map((w) => (
            <Choice key={w} label={`${w}px`} active={style.width === w} onClick={() => onStyle({ width: w })}>
              {w}
            </Choice>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 text-dense text-ev-muted">Style</span>
          {(["solid", "dashed", "dotted"] as const).map((ls) => (
            <Choice key={ls} label={ls} active={style.lineStyle === ls} onClick={() => onStyle({ lineStyle: ls })}>
              {ls === "solid" ? "───" : ls === "dashed" ? "– –" : "···"}
            </Choice>
          ))}
        </div>
      </Section>

      {fib && levels && (
        <Section title="Fibonacci levels">
          <div className="space-y-1">
            <div className="grid grid-cols-[24px_72px_1fr] gap-1 text-dense uppercase tracking-wider text-ev-faint">
              <span aria-hidden>On</span>
              <span>Ratio</span>
              <span>Colour</span>
            </div>
            {levels.map((level, i) => (
              <FibRow
                key={i}
                level={level}
                onChange={(next) => {
                  const updated = levels.map((l, idx) => (idx === i ? next : l));
                  onStyle({ fibLevels: updated });
                }}
              />
            ))}
          </div>
          <Toggle label="Reverse" checked={style.reverse === true} onChange={(reverse) => onStyle({ reverse })} />
          <Toggle label="Extend lines left" checked={style.extendLeft === true} onChange={(extendLeft) => onStyle({ extendLeft })} />
          <Toggle label="Extend lines right" checked={style.extendRight === true} onChange={(extendRight) => onStyle({ extendRight })} />
          <Toggle label="Show prices" checked={style.showPriceLabels !== false} onChange={(on) => onStyle({ showPriceLabels: on })} />
          <Slider label="Background fill" value={style.fillOpacity ?? 20} onChange={(fillOpacity) => onStyle({ fillOpacity })} />
        </Section>
      )}

      {!fib && toolHasFill(tool) && (
        <Section title="Background">
          <ColorRow label="Fill" value={style.fill ?? style.color} onChange={(fill) => onStyle({ fill })} />
          <Slider label="Fill opacity" value={style.fillOpacity ?? 20} onChange={(fillOpacity) => onStyle({ fillOpacity })} />
          <Toggle label="Middle line" checked={style.showMiddleLine === true} onChange={(showMiddleLine) => onStyle({ showMiddleLine })} />
        </Section>
      )}

      {toolSupportsExtend(tool) && !fib && (
        <Section title="Extension">
          <Toggle label="Extend left" checked={style.extendLeft === true} onChange={(extendLeft) => onStyle({ extendLeft })} />
          <Toggle label="Extend right" checked={style.extendRight === true} onChange={(extendRight) => onStyle({ extendRight })} />
        </Section>
      )}

      {ARROW_END_TOOLS.has(tool) && (
        <Section title="Ends">
          <SelectRow
            label="Left end"
            value={style.leftEnd ?? "normal"}
            options={[
              { value: "normal", label: "Normal" },
              { value: "arrow", label: "Arrow" },
            ]}
            onChange={(v) => onStyle({ leftEnd: v as "normal" | "arrow" })}
          />
          <SelectRow
            label="Right end"
            value={style.rightEnd ?? "normal"}
            options={[
              { value: "normal", label: "Normal" },
              { value: "arrow", label: "Arrow" },
            ]}
            onChange={(v) => onStyle({ rightEnd: v as "normal" | "arrow" })}
          />
        </Section>
      )}

      {toolShowsStats(tool) && (
        <Section title="Stats">
          <Toggle label="Show price" checked={style.showPriceLabels !== false} onChange={(on) => onStyle({ showPriceLabels: on })} />
          <Toggle
            label="Show stats (Δ, %, bars, angle)"
            checked={style.showStats === true}
            onChange={(showStats) => onStyle({ showStats })}
          />
          <SelectRow
            label="Position"
            value={style.statsPosition ?? "top"}
            options={[
              { value: "top", label: "Top" },
              { value: "middle", label: "Middle" },
              { value: "bottom", label: "Bottom" },
              { value: "right", label: "Right" },
            ]}
            onChange={(v) => onStyle({ statsPosition: v as DrawingStyle["statsPosition"] })}
          />
        </Section>
      )}

      {position && (
        <Section title="Risk / reward">
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2 text-dense text-ev-muted">
              Account size
              <input
                type="number"
                min={0}
                value={style.accountSize ?? ""}
                onChange={(e) => onStyle({ accountSize: e.target.value === "" ? undefined : Number(e.target.value) })}
                aria-label="Account size"
                className="w-24 rounded border border-ev-line bg-ev-bg px-1.5 py-0.5 text-right num text-ev-strong"
              />
            </label>
            <label className="flex items-center gap-2 text-dense text-ev-muted">
              Risk
              <input
                type="number"
                min={0}
                value={style.riskSize ?? ""}
                onChange={(e) => onStyle({ riskSize: e.target.value === "" ? undefined : Number(e.target.value) })}
                aria-label="Risk size"
                className="w-16 rounded border border-ev-line bg-ev-bg px-1.5 py-0.5 text-right num text-ev-strong"
              />
              <Select
                label="Risk mode"
                size="sm"
                value={style.riskMode ?? "percent"}
                onChange={(v) => onStyle({ riskMode: v as "percent" | "currency" })}
                options={[
                  { value: "percent", label: "%" },
                  { value: "currency", label: "$" },
                ]}
                className="w-16"
              />
            </label>
          </div>
          <ColorRow label="Stop colour" value={style.stopColor ?? "#ef5350"} onChange={(stopColor) => onStyle({ stopColor })} />
          <ColorRow label="Target colour" value={style.targetColor ?? "#26a69a"} onChange={(targetColor) => onStyle({ targetColor })} />
          <Toggle label="Show price labels" checked={style.showPriceLabels !== false} onChange={(on) => onStyle({ showPriceLabels: on })} />
          <button
            type="button"
            onClick={onApplyToOrder}
            className="rounded border border-ev-accent/60 bg-ev-accent/20 px-2 py-1 text-dense text-ev-accent-text hover:bg-ev-accent hover:text-white"
          >
            Apply to Order Ticket
          </button>
        </Section>
      )}
    </div>
  );
}

function TextTab({
  text,
  style,
  onText,
  onStyle,
}: {
  text: string;
  style: DrawingStyle;
  onText: (text: string) => void;
  onStyle: (patch: Partial<DrawingStyle>) => void;
}) {
  const enabled = text.length > 0;
  return (
    <div className="space-y-3">
      <Toggle label="Show text" checked={enabled} onChange={(on) => onText(on ? (text || "Text") : "")} />
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={3}
        aria-label="Drawing text"
        placeholder="Text shown on the chart"
        className="w-full resize-y rounded border border-ev-line bg-ev-bg px-2 py-1.5 text-base text-ev-strong outline-none focus:ring-1 focus:ring-ev-accent"
      />
      <div className="flex items-center gap-2">
        <span className="w-24 text-dense text-ev-muted">Size</span>
        <Select
          label="Font size"
          size="sm"
          value={String(style.fontSize ?? 13)}
          onChange={(v) => onStyle({ fontSize: Number(v) })}
          options={FONT_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          className="w-20"
        />
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={style.fontWeight === "bold"}
          onClick={() => onStyle({ fontWeight: style.fontWeight === "bold" ? "normal" : "bold" })}
          className={`rounded border border-ev-line px-2 py-0.5 font-bold ${style.fontWeight === "bold" ? "bg-ev-raised text-ev-strong" : "text-ev-muted"}`}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={style.fontStyle === "italic"}
          onClick={() => onStyle({ fontStyle: style.fontStyle === "italic" ? "normal" : "italic" })}
          className={`rounded border border-ev-line px-2 py-0.5 italic ${style.fontStyle === "italic" ? "bg-ev-raised text-ev-strong" : "text-ev-muted"}`}
        >
          I
        </button>
      </div>
      <ColorRow label="Text colour" value={style.textColor ?? style.color} onChange={(textColor) => onStyle({ textColor })} />
      <div className="flex items-center gap-2">
        <span className="w-24 text-dense text-ev-muted">Align</span>
        {(["left", "center", "right"] as const).map((align) => (
          <Choice key={align} label={`Align ${align}`} active={(style.textAlign ?? "left") === align} onClick={() => onStyle({ textAlign: align })}>
            {align[0]!.toUpperCase()}
          </Choice>
        ))}
        <span className="ml-2 w-16 text-dense text-ev-muted">Vertical</span>
        {(["top", "middle", "bottom"] as const).map((valign) => (
          <Choice
            key={valign}
            label={`Vertical align ${valign}`}
            active={(style.textVAlign ?? "top") === valign}
            onClick={() => onStyle({ textVAlign: valign })}
          >
            {valign[0]!.toUpperCase()}
          </Choice>
        ))}
      </div>
    </div>
  );
}

function CoordinatesTab({ points, onPoints }: { points: Point[]; onPoints: (points: Point[]) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-dense text-ev-muted">Exact anchors, for when a drag is not precise enough.</p>
      {points.map((point, i) => (
        <div key={i} className="grid grid-cols-[62px_1fr_1fr] items-center gap-2">
          <span className="text-dense text-ev-faint">Point {i + 1}</span>
          <label className="flex items-center gap-1 text-dense text-ev-muted">
            Price
            <input
              type="number"
              step="any"
              value={point.price}
              aria-label={`Point ${i + 1} price`}
              onChange={(e) => {
                const price = Number(e.target.value);
                if (!Number.isFinite(price)) return;
                onPoints(points.map((p, idx) => (idx === i ? { ...p, price } : p)));
              }}
              className="min-w-0 flex-1 rounded border border-ev-line bg-ev-bg px-1.5 py-0.5 text-right num text-ev-strong"
            />
          </label>
          <label className="flex items-center gap-1 text-dense text-ev-muted">
            Time
            <input
              type="datetime-local"
              step={1}
              value={toDatetimeLocal(point.time)}
              aria-label={`Point ${i + 1} time`}
              onChange={(e) => {
                const time = fromDatetimeLocal(e.target.value);
                if (time === null) return;
                onPoints(points.map((p, idx) => (idx === i ? { ...p, time } : p)));
              }}
              className="min-w-0 flex-1 rounded border border-ev-line bg-ev-bg px-1 py-0.5 num text-ev-strong"
            />
          </label>
        </div>
      ))}
    </div>
  );
}

function VisibilityTab({
  visibility,
  onChange,
}: {
  visibility?: DrawingVisibility;
  onChange: (visibility: DrawingVisibility | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-dense text-ev-muted">Show this drawing on these chart intervals.</p>
      {TIMEFRAME_UNITS.map((unit) => (
        <Toggle
          key={unit.id}
          label={unit.label}
          checked={visibility?.[unit.id] !== false}
          onChange={(on) => onChange({ ...visibility, [unit.id]: on })}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className="rounded border border-ev-line px-2 py-1 text-dense text-ev-text hover:bg-ev-raised"
      >
        Reset to visible on all timeframes
      </button>
    </div>
  );
}

function Footer({
  onCancel,
  onOk,
  onApplyTemplate,
  onSaveTemplate,
}: {
  onCancel: () => void;
  onOk: () => void;
  onApplyTemplate: (id: string) => void;
  onSaveTemplate: (name: string) => void;
}) {
  const [templates, setTemplates] = useState(() => listDrawingTemplates());
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="flex items-center justify-between gap-2 border-t border-ev-raised px-3 py-2">
      <div className="flex min-w-0 items-center gap-1">
        <Select
          label="Apply drawing template"
          size="sm"
          placeholder="Template ▾"
          value=""
          onChange={(v) => {
            if (v) onApplyTemplate(v);
          }}
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
          className="w-36"
        />
        {saving ? (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="New template name"
              placeholder="Name"
              className="w-28 rounded border border-ev-line bg-ev-bg px-1.5 py-1 text-dense text-ev-strong"
            />
            <button
              type="button"
              onClick={() => {
                const trimmed = name.trim();
                if (!trimmed) return;
                onSaveTemplate(trimmed);
                setTemplates(listDrawingTemplates());
                setSaving(false);
                setName("");
              }}
              className="rounded border border-ev-line px-2 py-1 text-dense text-ev-text hover:bg-ev-raised"
            >
              Save
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="rounded border border-ev-line px-2 py-1 text-dense text-ev-text hover:bg-ev-raised"
          >
            Save as…
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-ev-line px-3 py-1 text-dense text-ev-text hover:bg-ev-raised"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onOk}
          className="rounded bg-ev-accent px-3 py-1 text-dense font-medium text-white hover:opacity-90"
        >
          OK
        </button>
      </div>
    </div>
  );
}

// --- small controls --------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-dense font-semibold uppercase tracking-wider text-ev-faint">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-dense text-ev-text">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-ev-accent" />
      {label}
    </label>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-dense text-ev-muted">
      <span className="w-28">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-ev-accent"
      />
      <span className="w-9 text-right num">{Math.round(value)}%</span>
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-dense text-ev-muted">{label}</span>
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#2962ff"}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-6 w-9 cursor-pointer rounded border border-ev-line bg-ev-bg"
      />
      <div className="flex flex-wrap gap-1">
        {COLORS.slice(0, 6).map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${label} ${c}`}
            aria-pressed={value.toLowerCase() === c}
            onClick={() => onChange(c)}
            className={`size-3.5 rounded-full ring-1 ${value.toLowerCase() === c ? "ring-2 ring-ev-accent" : "ring-ev-line"}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-dense text-ev-muted">
      <span className="w-28">{label}</span>
      <Select label={label} size="sm" value={value} onChange={onChange} options={options} />
    </div>
  );
}

function Choice({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-dense ${
        active ? "border-ev-accent bg-ev-raised text-ev-strong" : "border-ev-line text-ev-muted hover:text-ev-strong"
      }`}
    >
      {children}
    </button>
  );
}

function FibRow({ level, onChange }: { level: FibLevelStyle; onChange: (level: FibLevelStyle) => void }) {
  return (
    <div className="grid grid-cols-[24px_72px_1fr] items-center gap-1">
      <input
        type="checkbox"
        checked={level.enabled}
        aria-label={`Enable ${level.label}`}
        onChange={(e) => onChange({ ...level, enabled: e.target.checked })}
        className="accent-ev-accent"
      />
      <input
        type="number"
        step="0.001"
        value={level.ratio}
        aria-label={`Ratio ${level.label}`}
        onChange={(e) => {
          const ratio = Number(e.target.value);
          if (!Number.isFinite(ratio)) return;
          onChange({ ...level, ratio, label: `${(ratio * 100).toFixed(1)}%` });
        }}
        className="w-full rounded border border-ev-line bg-ev-bg px-1 py-0.5 text-right num text-ev-strong"
      />
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={level.color ?? "#2962ff"}
          onChange={(e) => onChange({ ...level, color: e.target.value })}
          aria-label={`Colour ${level.label}`}
          className="h-5 w-7 cursor-pointer rounded border border-ev-line bg-ev-bg"
        />
        <span className="text-dense text-ev-faint">{level.label}</span>
      </div>
    </div>
  );
}

// --- time helpers ----------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Epoch seconds → the value a `datetime-local` input expects (local time). */
function toDatetimeLocal(seconds: number): string {
  const d = new Date(seconds * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** `datetime-local` value → epoch seconds, or null when unparseable. */
function fromDatetimeLocal(value: string): number | null {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}
