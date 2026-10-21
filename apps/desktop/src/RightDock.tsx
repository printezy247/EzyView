import type { ReactNode } from "react";

/**
 * A docked right-hand panel with a tab strip: one panel visible at a time
 * instead of three stacked, each of which shrank the chart. The tabs replaced
 * the per-panel booleans that used to live in the shell (`watchlistOpen`,
 * `domOpen`, `objectsOpen`), so "which panel is open" is now a single value and
 * the chart gets a stable width.
 */

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

interface Props {
  tabs: DockTab[];
  active: DockTabId | null;
  onSelect: (id: DockTabId | null) => void;
  /** Panel width in px; the caller owns it so a resize handle can change it. */
  width?: number;
}

export function RightDock({ tabs, active, onSelect, width = 288 }: Props) {
  return (
    <aside
      aria-label="Chart panels"
      className="flex shrink-0 flex-col border-l border-ev-raised bg-ev-bg"
      style={{ width }}
    >
      <div role="tablist" aria-label="Panel" className="flex h-8 shrink-0 items-center gap-0.5 border-b border-ev-raised px-1">
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
                  ? "flex items-center gap-1 rounded px-2 py-1 text-dense font-medium text-ev-strong"
                  : "flex items-center gap-1 rounded px-2 py-1 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
              }
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="num rounded bg-ev-accent px-1 text-micro text-white">{tab.badge}</span>
              )}
            </button>
          );
        })}
        {active !== null && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            title="Hide panel"
            aria-label="Hide panel"
            className="ml-auto rounded px-1.5 py-1 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {active === null ? (
          <p className="px-3 py-6 text-base leading-relaxed text-ev-faint">
            No panel open. Pick one above — or press a tab again to close it.
          </p>
        ) : (
          (tabs.find((t) => t.id === active)?.render() ?? null)
        )}
      </div>
    </aside>
  );
}
