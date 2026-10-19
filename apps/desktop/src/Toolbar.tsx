import type { Resolution } from "@ezyview/data-adapters";
import type { ChartType } from "@ezyview/chart-engine";
import { Eye, FlaskConical } from "lucide-react";
import { PICKER_RESOLUTIONS } from "./data";
import { Menu } from "./Menu";
import type { MenuEntry } from "./Menu";
import { SymbolSearch } from "./SymbolSearch";

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Candles" },
  { id: "bars", label: "Bars" },
  { id: "hollow", label: "Hollow candles" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "baseline", label: "Baseline" },
];

/** Panels the View menu shows or hides. Trade, Journal, Fundamentals and Options share one slot. */
export type PanelId = "watchlist" | "depth" | "trading" | "journal" | "fundamentals" | "options";

interface Props {
  symbol: string;
  resolution: Resolution;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  theme: "dark" | "light";
  indicatorCount: number;
  pineActive: boolean;
  replayActive: boolean;
  panels: Record<PanelId, boolean>;
  onSymbol: (s: string) => void;
  onResolution: (r: Resolution) => void;
  onChartType: (t: ChartType) => void;
  onToggleVolume: () => void;
  onToggleGrid: () => void;
  onToggleTheme: () => void;
  onOpenIndicators: () => void;
  onTogglePine: () => void;
  onToggleReplay: () => void;
  onTogglePanel: (id: PanelId) => void;
  onOpenWindow: () => void;
}

/**
 * Chart controls, then two category menus instead of a wall of buttons:
 *   Studies → indicators + Pine editor
 *   View    → panels, chart overlays, appearance
 * Frequent one-click things (symbol, interval, chart type, replay, trade) stay
 * on the bar; everything else lives one level down, grouped by what it does.
 */
export function Toolbar(props: Props) {
  const typeEntries: MenuEntry[] = CHART_TYPES.map(
    (t): MenuEntry => ({
      kind: "radio",
      id: t.id,
      label: t.label,
      selected: t.id === props.chartType,
      onSelect: () => props.onChartType(t.id),
    }),
  );

  const studyEntries: MenuEntry[] = [
    { kind: "action", id: "indicators", label: "Indicators…", onSelect: props.onOpenIndicators },
    { kind: "toggle", id: "pine", label: "Pine editor", checked: props.pineActive, onSelect: props.onTogglePine },
  ];

  const viewEntries: MenuEntry[] = [
    { kind: "label", id: "panels", label: "Panels" },
    {
      kind: "toggle",
      id: "watchlist",
      label: "Watchlist",
      checked: props.panels.watchlist,
      onSelect: () => props.onTogglePanel("watchlist"),
    },
    {
      kind: "toggle",
      id: "depth",
      label: "Depth of market",
      checked: props.panels.depth,
      onSelect: () => props.onTogglePanel("depth"),
    },
    {
      kind: "toggle",
      id: "trading",
      label: "Trade panel",
      checked: props.panels.trading,
      onSelect: () => props.onTogglePanel("trading"),
    },
    {
      kind: "toggle",
      id: "journal",
      label: "Journal",
      checked: props.panels.journal,
      onSelect: () => props.onTogglePanel("journal"),
    },
    {
      kind: "toggle",
      id: "fundamentals",
      label: "Fundamentals & screener",
      checked: props.panels.fundamentals,
      onSelect: () => props.onTogglePanel("fundamentals"),
    },
    {
      kind: "toggle",
      id: "options",
      label: "Options",
      checked: props.panels.options,
      onSelect: () => props.onTogglePanel("options"),
    },
    { kind: "separator", id: "s-window" },
    { kind: "action", id: "new-window", label: "Open chart in new window", onSelect: props.onOpenWindow },
    { kind: "separator", id: "s-chart" },
    { kind: "label", id: "chart", label: "Chart" },
    { kind: "toggle", id: "volume", label: "Volume", checked: props.showVolume, onSelect: props.onToggleVolume },
    { kind: "toggle", id: "grid", label: "Grid", checked: props.showGrid, onSelect: props.onToggleGrid },
    { kind: "separator", id: "s-theme" },
    { kind: "label", id: "appearance", label: "Appearance" },
    {
      kind: "radio",
      id: "dark",
      label: "Dark theme",
      selected: props.theme === "dark",
      onSelect: () => {
        if (props.theme !== "dark") props.onToggleTheme();
      },
    },
    {
      kind: "radio",
      id: "light",
      label: "Light theme",
      selected: props.theme === "light",
      onSelect: () => {
        if (props.theme !== "light") props.onToggleTheme();
      },
    },
  ];

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[#1e222d] px-2">
      <SymbolSearch symbol={props.symbol} onSelect={props.onSymbol} />

      <div className="mx-1 h-4 w-px bg-[#1e222d]" />

      {/* Intervals read as one segmented control, not seven loose buttons. */}
      <div role="group" aria-label="Interval" className="flex items-center rounded border border-[#2a2e39]">
        {PICKER_RESOLUTIONS.map((r, index) => (
          <button
            key={r}
            type="button"
            aria-pressed={r === props.resolution}
            onClick={() => props.onResolution(r)}
            className={
              (index > 0 ? "border-l border-[#2a2e39] " : "") +
              (r === props.resolution
                ? "bg-[#1e222d] px-2 py-1 text-xs font-medium text-white"
                : "px-2 py-1 text-xs text-[#787b86] hover:bg-[#1e222d] hover:text-white")
            }
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mx-1 h-4 w-px bg-[#1e222d]" />

      <Menu
        label={CHART_TYPES.find((t) => t.id === props.chartType)?.label ?? "Candles"}
        caption="Chart type"
        entries={typeEntries}
      />

      <Menu
        label="Studies"
        caption="Studies"
        icon={<FlaskConical size={13} aria-hidden />}
        badge={props.indicatorCount}
        triggerActive={props.pineActive}
        entries={studyEntries}
      />

      <Menu label="View" caption="View" icon={<Eye size={13} aria-hidden />} entries={viewEntries} />

      <div className="mx-1 h-4 w-px bg-[#1e222d]" />

      <button
        type="button"
        onClick={props.onToggleReplay}
        aria-pressed={props.replayActive}
        className={
          props.replayActive
            ? "rounded bg-[#2962ff] px-2 py-1 text-xs font-medium text-white"
            : "rounded px-2 py-1 text-xs text-[#787b86] hover:bg-[#1e222d] hover:text-white"
        }
      >
        Replay
      </button>

      <div className="ml-auto">
        <button
          type="button"
          onClick={() => props.onTogglePanel("trading")}
          aria-pressed={props.panels.trading}
          className={
            props.panels.trading
              ? "rounded bg-[#2962ff] px-2 py-1 text-xs font-medium text-white"
              : "rounded px-2 py-1 text-xs text-[#787b86] hover:bg-[#1e222d] hover:text-white"
          }
        >
          Trade
        </button>
      </div>
    </div>
  );
}
