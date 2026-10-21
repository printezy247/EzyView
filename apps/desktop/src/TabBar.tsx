import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  ExternalLink,
  HelpCircle,
  Layers,
  Link2,
  Maximize2,
  Palette,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import { useNavigate } from "react-router";
import { Menu } from "./Menu";
import type { MenuEntry } from "./Menu";
import { useWorkspace } from "./store";
import { linkGroupOf } from "./linkGroups";
import { openChartWindow } from "./windows";
import { useZen } from "./zen";

const LINK_COLORS: { id: string; label: string; hex: string }[] = [
  { id: "", label: "Unlinked", hex: "transparent" },
  { id: "blue", label: "Blue tag — sync symbol & interval", hex: "#2962ff" },
  { id: "red", label: "Red tag — sync symbol & interval", hex: "#f23645" },
  { id: "green", label: "Green tag — sync symbol & interval", hex: "#089981" },
  { id: "orange", label: "Orange tag — sync symbol & interval", hex: "#ff9800" },
  { id: "purple", label: "Purple tag — sync symbol & interval", hex: "#9c27b0" },
];

const TRADING_TIPS = [
  "Plan the trade, see the trade, feel the trade.",
  "Good traders try to avoid losing money. Great traders accept they will lose money.",
  "Sometimes the best trades are the ones you did not take.",
  "When in doubt, zoom out.",
  "Rule #1 - Don't get rugged.",
];

/** Layout tabs + TradingView Desktop window navigation, color-tag linking, and quick workspace controls. */
export function TabBar() {
  const navigate = useNavigate();
  const layouts = useWorkspace((s) => s.layouts);
  const activeId = useWorkspace((s) => s.activeLayoutId);
  const dirty = useWorkspace((s) => s.dirty);
  const setActive = useWorkspace((s) => s.setActiveLayout);
  const addLayout = useWorkspace((s) => s.addLayout);
  const copyLayout = useWorkspace((s) => s.copyLayout);
  const deleteLayout = useWorkspace((s) => s.deleteLayout);
  const renameLayout = useWorkspace((s) => s.renameLayout);
  const sortLayouts = useWorkspace((s) => s.sortLayouts);
  const activeChart = useWorkspace((s) => s.activeChart());
  const setLinkGroup = useWorkspace((s) => s.setLinkGroup);
  const crosshairSync = useWorkspace((s) => s.crosshairSync);
  const setCrosshairSync = useWorkspace((s) => s.setCrosshairSync);
  const updateActive = useWorkspace((s) => s.updateActive);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [tipIndex, setTipIndex] = useState(0);

  const currentLink = linkGroupOf(activeChart);
  const linkColorHex = LINK_COLORS.find((c) => c.id === currentLink)?.hex ?? "#2962ff";

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setDraftName(current);
  };

  const commitRename = (id: string) => {
    const trimmed = draftName.trim();
    if (trimmed) renameLayout(id, trimmed);
    setRenamingId(null);
  };

  const cycleTheme = () => {
    const order = ["dark", "tokyo", "light"] as const;
    const next = order[(order.indexOf(activeChart.theme) + 1) % order.length] ?? "dark";
    updateActive({ theme: next });
  };

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-ev-raised bg-ev-chrome px-2">
      {/* Browser/Desktop history navigation controls */}
      <div className="mr-1 flex items-center gap-0.5">
        <button
          type="button"
          title="Go back"
          aria-label="Go back"
          onClick={() => window.history.back()}
          className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <ArrowLeft size={13} aria-hidden />
        </button>
        <button
          type="button"
          title="Go forward"
          aria-label="Go forward"
          onClick={() => window.history.forward()}
          className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <ArrowRight size={13} aria-hidden />
        </button>
        <button
          type="button"
          title="Reload tab"
          aria-label="Reload tab"
          onClick={() => window.location.reload()}
          className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <RotateCw size={12} aria-hidden />
        </button>
      </div>

      <div className="h-4 w-px bg-ev-raised" />

      {/* Layout tabs */}
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {layouts.map((layout) => {
          const active = layout.id === activeId;
          return (
            <div
              key={layout.id}
              className={
                active
                  ? "flex shrink-0 items-center gap-0.5 rounded-t border-b-2 bg-ev-panel"
                  : "flex shrink-0 items-center gap-0.5 rounded hover:bg-ev-panel"
              }
              style={active ? { borderColor: layout.color } : undefined}
            >
              {renamingId === layout.id ? (
                <input
                  type="text"
                  value={draftName}
                  autoFocus
                  aria-label="Enter a new chart layout name"
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitRename(layout.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(layout.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="w-28 rounded bg-ev-bg px-2 py-0.5 text-dense text-ev-strong outline-none ring-1 ring-ev-accent"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setActive(layout.id)}
                  onDoubleClick={() => startRename(layout.id, layout.name)}
                  title="Click to switch layout · Double-click to customize tab title"
                  aria-current={active ? "true" : undefined}
                  className={
                    active
                      ? "flex items-center gap-1.5 rounded-t px-2.5 py-1 text-base font-medium text-ev-strong"
                      : "flex items-center gap-1.5 rounded px-2.5 py-1 text-base text-ev-muted hover:text-ev-strong"
                  }
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: layout.color }}
                    aria-hidden
                  />
                  <span>{layout.name}</span>
                  <span className="text-micro text-ev-faint">
                    {layout.charts[layout.activeChart]?.symbol.split(":").pop()}
                  </span>
                  {dirty[layout.id] && <span className="text-ev-muted">•</span>}
                </button>
              )}
              {active && layouts.length > 1 && (
                <button
                  type="button"
                  title={`Close ${layout.name}`}
                  aria-label={`Close layout ${layout.name}`}
                  onClick={() => deleteLayout(layout.id)}
                  className="mr-1 flex size-5 items-center justify-center rounded text-ev-faint hover:bg-ev-line hover:text-ev-strong"
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </div>
          );
        })}

        {/* 1-click New Tab button */}
        <button
          type="button"
          title="New Tab — Create new layout"
          aria-label="New Tab"
          onClick={addLayout}
          className="flex size-6 shrink-0 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>

      {/* Layout actions menu */}
      <Menu
        label="Layouts"
        caption="Layout actions"
        icon={<Layers size={13} aria-hidden />}
        entries={
          [
            { kind: "action", id: "new", label: "Create new layout", onSelect: addLayout },
            { kind: "action", id: "duplicate", label: "Duplicate tab", onSelect: () => copyLayout(activeId) },
            {
              kind: "action",
              id: "rename",
              label: "Customize tab title…",
              onSelect: () => {
                const cur = layouts.find((l) => l.id === activeId);
                if (cur) startRename(cur.id, cur.name);
              },
            },
            { kind: "separator", id: "s-sort" },
            { kind: "action", id: "sort-name", label: "Layout name (A to Z)", onSelect: () => sortLayouts("name") },
            { kind: "action", id: "sort-date", label: "Date modified (oldest first)", onSelect: () => sortLayouts("date") },
            { kind: "separator", id: "s" },
            {
              kind: "action",
              id: "close",
              label: "Close active layout",
              disabled: layouts.length <= 1,
              onSelect: () => deleteLayout(activeId),
            },
          ] satisfies MenuEntry[]
        }
      />

      {/* Tab color linking menu (TradingView Desktop feature) */}
      <Menu
        label={currentLink ? `Link: ${currentLink}` : "Tab linking"}
        caption="Changing the symbol updates it across all synced tabs with the same color tag"
        icon={
          <span className="flex items-center gap-1">
            <Link2 size={12} aria-hidden />
            {currentLink && <span className="size-2 rounded-full" style={{ backgroundColor: linkColorHex }} />}
          </span>
        }
        entries={LINK_COLORS.map(
          (c): MenuEntry => ({
            kind: "radio",
            id: `link-${c.id || "none"}`,
            label: c.label,
            selected: currentLink === c.id,
            onSelect: () => setLinkGroup(c.id),
          }),
        )}
      />

      {/* Right-hand quick desktop controls */}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-pressed={crosshairSync}
          title="Ideal for a thorough study of the market, your crosshairs will move in sync across all your displays"
          onClick={() => setCrosshairSync(!crosshairSync)}
          className={`flex h-6 items-center gap-1 rounded px-2 text-dense ${
            crosshairSync
              ? "bg-ev-accent/20 font-medium text-ev-accent-text"
              : "text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          }`}
        >
          <Crosshair size={12} aria-hidden />
          <span className="hidden sm:inline">Crosshair sync</span>
        </button>

        <button
          type="button"
          title={`Color theme: ${activeChart.theme} (click to cycle Dark / Tokyo Night / Light)`}
          onClick={cycleTheme}
          className="flex h-6 items-center gap-1 rounded px-2 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <Palette size={12} aria-hidden />
          <span className="hidden capitalize md:inline">{activeChart.theme}</span>
        </button>

        <button
          type="button"
          title="Detach tab — Open chart in new window for multi-monitor support"
          aria-label="Open in new window"
          onClick={() => void openChartWindow(activeChart.symbol, activeChart.resolution)}
          className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <ExternalLink size={13} aria-hidden />
        </button>

        <button
          type="button"
          title="Toggle full screen (F11)"
          aria-label="Toggle full screen"
          onClick={() => useZen.getState().toggle()}
          className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
        >
          <Maximize2 size={13} aria-hidden />
        </button>

        <Menu
          label=""
          caption="Help and resources"
          icon={<HelpCircle size={13} aria-hidden />}
          entries={[
            {
              kind: "label",
              id: "tip",
              label: `💡 "${TRADING_TIPS[tipIndex % TRADING_TIPS.length]}"`,
            },
            {
              kind: "action",
              id: "next-tip",
              label: "Next trading wisdom",
              onSelect: () => setTipIndex((i) => i + 1),
            },
            { kind: "separator", id: "s-help" },
            {
              kind: "action",
              id: "mcp-setup",
              label: "Set up EzyView MCP Server…",
              onSelect: () => navigate("/settings"),
            },
            {
              kind: "action",
              id: "settings",
              label: "Desktop & proxy settings…",
              onSelect: () => navigate("/settings"),
            },
          ]}
        />
      </div>
    </div>
  );
}
