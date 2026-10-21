import { useState, type ReactNode } from "react";
import { Activity, BookOpen, Columns, Layers, List, PanelRightClose } from "lucide-react";

/**
 * The right-dock tabs. Declared here rather than in the toolbar so every
 * consumer (chart page, menu host, toolbar) imports one definition — a new tab
 * is added in the dock's tab list below and the type follows.
 */
export type DockTabId = "watchlist" | "depth" | "objects" | "tape";

export interface DockTab {
  id: DockTabId;
  label: string;
  /** Hover hint for the tab. */
  hint?: string;
  /** Rendered only while the tab is active. */
  render: () => ReactNode;
  /** Small badge (e.g. object count) shown on the tab. */
  badge?: number;
}

const TAB_ICON: Record<DockTabId, ReactNode> = {
  watchlist: <List size={14} aria-hidden />,
  depth: <BookOpen size={14} aria-hidden />,
  objects: <Layers size={14} aria-hidden />,
  tape: <Activity size={14} aria-hidden />,
};

const WIDTH_PRESETS = [256, 300, 360] as const;

interface Props {
  tabs: DockTab[];
  active: DockTabId | null;
  onSelect: (id: DockTabId | null) => void;
  /** Panel width in px; the caller owns it so a resize handle can change it. */
  width?: number;
}

export function RightDock({ tabs, active, onSelect, width }: Props) {
  const [widthIdx, setWidthIdx] = useState(1);
  const resolvedWidth = width ?? WIDTH_PRESETS[widthIdx] ?? 300;

  // When collapsed (active === null), render a slim TradingView-style 38px vertical icon rail
  // so the chart gets maximum horizontal room!
  if (active === null) {
    return (
      <aside
        aria-label="Chart panels"
        className="flex w-10 shrink-0 flex-col items-center gap-1 border-l border-ev-raised bg-ev-chrome py-2"
      >
        <div role="tablist" aria-label="Panel" className="flex flex-col items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={false}
              title={`${tab.label} — ${tab.hint ?? "Click to expand panel"}`}
              onClick={() => onSelect(tab.id)}
              className="relative flex size-8 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
            >
              {TAB_ICON[tab.id]}
              <span className="sr-only">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="num absolute -right-0.5 -top-0.5 rounded-full bg-ev-accent px-1 text-[9px] leading-tight text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Chart panels"
      className="flex shrink-0 flex-col border-l border-ev-raised bg-ev-bg transition-[width] duration-150"
      style={{ width: resolvedWidth }}
    >
      <div role="tablist" aria-label="Panel" className="flex h-8 shrink-0 items-center gap-0.5 border-b border-ev-raised bg-ev-chrome px-1">
        {tabs.map((tab) => {
          const on = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              title={tab.hint ?? tab.label}
              onClick={() => onSelect(on ? null : tab.id)}
              className={
                on
                  ? "flex items-center gap-1 rounded bg-ev-panel px-2 py-1 text-dense font-medium text-ev-strong shadow-xs"
                  : "flex items-center gap-1 rounded px-2 py-1 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
              }
            >
              {TAB_ICON[tab.id]}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="num rounded bg-ev-accent px-1 text-micro text-white">{tab.badge}</span>
              )}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            title="Cycle panel width (Compact / Standard / Wide)"
            aria-label="Cycle panel width"
            onClick={() => setWidthIdx((i) => (i + 1) % WIDTH_PRESETS.length)}
            className="rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            <Columns size={12} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onSelect(null)}
            title="Collapse panel to right rail"
            aria-label="Hide panel"
            className="rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            <PanelRightClose size={13} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {tabs.find((t) => t.id === active)?.render() ?? null}
      </div>
    </aside>
  );
}
