import type { Resolution } from "@ezyview/data-adapters";
import type { ChartType } from "@ezyview/chart-engine";
import { useEffect, useState } from "react";
import { ArrowLeftRight, CandlestickChart, Clock, Eye, FlaskConical, Search, Telescope } from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import type { CommandGroup } from "./CommandPalette";
import { RESOLUTION_GROUPS, resolutionName } from "./data";
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

/** Toggleable panels. Trade, Journal, Fundamentals and Options share the bottom slot. */
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
  onOpenAlerts: () => void;
}

const PALETTE_KEY = "Ctrl+K";

const toggle = (id: string, label: string, checked: boolean, onSelect: () => void): MenuEntry => ({
  kind: "toggle",
  id,
  label,
  checked,
  onSelect,
});

/**
 * The top bar is a quiet menu bar, not a row of buttons. Features are grouped
 * by intent, and every menu item is also reachable from the Ctrl+K palette:
 *   Interval · Chart type   — what the chart shows
 *   Studies                 — indicators and Pine scripts on the chart
 *   Analysis                — research tools (fundamentals, options, replay, alerts)
 *   Trade                   — order ticket, depth of market, journal
 *   View                    — side panels, overlays, theme, windows
 */
export function Toolbar(props: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ctrl+K (Cmd+K on macOS) opens the feature search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const panel = (id: PanelId, label: string) => toggle(id, label, props.panels[id], () => props.onTogglePanel(id));

  const intervalEntries: MenuEntry[] = [];
  for (const group of RESOLUTION_GROUPS) {
    intervalEntries.push({ kind: "label", id: `g-${group.label}`, label: group.label });
    for (const r of group.items) {
      intervalEntries.push({
        kind: "radio",
        id: r,
        label: resolutionName(r),
        selected: r === props.resolution,
        onSelect: () => props.onResolution(r),
      });
    }
  }

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
    toggle("pine", "Pine editor", props.pineActive, props.onTogglePine),
  ];

  const analysisEntries: MenuEntry[] = [
    { kind: "label", id: "research", label: "Research" },
    panel("fundamentals", "Fundamentals & screener"),
    panel("options", "Options chain"),
    { kind: "separator", id: "s-tools" },
    { kind: "label", id: "tools", label: "Tools" },
    toggle("replay", "Bar replay", props.replayActive, props.onToggleReplay),
    { kind: "action", id: "alerts", label: "Price alerts…", onSelect: props.onOpenAlerts },
  ];

  const tradeEntries: MenuEntry[] = [
    panel("trading", "Order ticket & positions"),
    panel("depth", "Depth of market"),
    { kind: "separator", id: "s-review" },
    panel("journal", "Trading journal"),
  ];

  const viewEntries: MenuEntry[] = [
    { kind: "label", id: "panels", label: "Panels" },
    panel("watchlist", "Watchlist"),
    { kind: "separator", id: "s-chart" },
    { kind: "label", id: "chart", label: "Chart" },
    toggle("volume", "Volume", props.showVolume, props.onToggleVolume),
    toggle("grid", "Grid", props.showGrid, props.onToggleGrid),
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
    { kind: "separator", id: "s-window" },
    { kind: "label", id: "window", label: "Window" },
    { kind: "action", id: "new-window", label: "Open chart in new window", onSelect: props.onOpenWindow },
    { kind: "action", id: "palette", label: "Search features…", hint: PALETTE_KEY, onSelect: () => setPaletteOpen(true) },
  ];

  const groups: CommandGroup[] = [
    { title: "Interval", entries: intervalEntries },
    { title: "Chart type", entries: typeEntries },
    { title: "Studies", entries: studyEntries },
    { title: "Analysis", entries: analysisEntries },
    { title: "Trade", entries: tradeEntries },
    { title: "View", entries: viewEntries.filter((e) => e.id !== "palette") },
  ];

  const tradeOpen = props.panels.trading || props.panels.depth || props.panels.journal;
  const analysisOpen = props.panels.fundamentals || props.panels.options || props.replayActive;

  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-[#1e222d] px-2">
      <SymbolSearch symbol={props.symbol} onSelect={props.onSymbol} />

      <div className="mx-1 h-4 w-px bg-[#1e222d]" />

      <Menu label={props.resolution} caption="Interval" icon={<Clock size={13} aria-hidden />} entries={intervalEntries} />
      <Menu
        label={CHART_TYPES.find((t) => t.id === props.chartType)?.label ?? "Candles"}
        caption="Chart type"
        icon={<CandlestickChart size={13} aria-hidden />}
        entries={typeEntries}
      />

      <div className="mx-1 h-4 w-px bg-[#1e222d]" />

      <nav aria-label="Main menu" className="flex items-center gap-0.5">
        <Menu
          label="Studies"
          icon={<FlaskConical size={13} aria-hidden />}
          badge={props.indicatorCount}
          triggerActive={props.pineActive}
          entries={studyEntries}
        />
        <Menu label="Analysis" icon={<Telescope size={13} aria-hidden />} triggerActive={analysisOpen} entries={analysisEntries} />
        <Menu label="Trade" icon={<ArrowLeftRight size={13} aria-hidden />} triggerActive={tradeOpen} entries={tradeEntries} />
        <Menu label="View" icon={<Eye size={13} aria-hidden />} entries={viewEntries} />
      </nav>

      {props.replayActive && (
        <span className="ml-2 rounded bg-[#2962ff]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#5b8cff]">Replay on</span>
      )}

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-keyshortcuts="Control+K"
        className="ml-auto flex h-6 w-56 items-center gap-2 rounded border border-[#2a2e39] px-2 text-[11px] text-[#787b86] hover:border-[#434651] hover:text-white"
      >
        <Search size={12} aria-hidden />
        <span className="flex-1 text-left">Search features</span>
        <kbd className="text-[10px] text-[#434651]">{PALETTE_KEY}</kbd>
      </button>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={groups} />
    </div>
  );
}
