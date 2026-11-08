import { type ReactNode } from "react";
import { NavLink } from "react-router";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Code,
  Globe,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Wallet,
} from "lucide-react";
import { NAV_SECTIONS } from "./nav";
import { SHELL_RAIL_ICON, SHELL_RAIL_WIDTH, shellToolClass } from "./ui";
import { useWorkspace } from "./store";
import { useNavRail } from "./navRail";
import { useTrading } from "./trading";

/** Left-edge section rail: one lit icon per destination, in redesign order. */
const ICONS: Record<string, ReactNode> = {
  "/chart": <LineChart size={SHELL_RAIL_ICON} aria-hidden />,
  "/markets": <Globe size={SHELL_RAIL_ICON} aria-hidden />,
  "/trade": <Wallet size={SHELL_RAIL_ICON} aria-hidden />,
  "/research": <BarChart3 size={SHELL_RAIL_ICON} aria-hidden />,
  "/journal": <BookOpen size={SHELL_RAIL_ICON} aria-hidden />,
  "/strategies": <Code size={SHELL_RAIL_ICON} aria-hidden />,
  "/alerts": <Bell size={SHELL_RAIL_ICON} aria-hidden />,
  "/settings": <Settings size={SHELL_RAIL_ICON} aria-hidden />,
};

/** Width of the rail when its labels are visible. */
const EXPANDED_WIDTH = "w-52";

/**
 * The left rail: every destination in the app, in one column.
 *
 * It has two states. Collapsed, it is a 48px strip of icons with a hover
 * flyout for the label — the space-efficient default. Expanded, it is a
 * 208px column with the label and a live count next to each destination,
 * so a user who does not know that one icon means "Research" can read it
 * instead of recalling it.
 *
 * The counts are the reason the expanded state earns its width: how many
 * alerts are armed, how many positions are open. Those numbers are the
 * first thing a trader looks for and they were not on screen at all.
 */
export function NavRail() {
  // The rail's width lives in a store so a keyboard binding can toggle it.
  const expanded = useNavRail((s) => s.expanded);
  const setExpanded = useNavRail((s) => s.setExpanded);

  // Narrow subscriptions: the badge counts, not the objects they live in.
  const alertCount = useWorkspace((s) => s.alerts.length);
  const positionCount = useTrading((s) => s.positions.length);

  const badgeFor = (to: string): number | undefined => {
    if (to === "/alerts") return alertCount > 0 ? alertCount : undefined;
    if (to === "/trade") return positionCount > 0 ? positionCount : undefined;
    return undefined;
  };

  return (
    <nav
      aria-label="Sections"
      data-expanded={expanded ? "true" : "false"}
      className={`flex ${expanded ? EXPANDED_WIDTH : SHELL_RAIL_WIDTH} shrink-0 flex-col items-stretch gap-1 border-r border-ev-raised bg-ev-chrome py-2 ev-panel-edge transition-[width] duration-150`}
    >
      <div className={`flex shrink-0 items-center ${expanded ? "justify-end px-2" : "justify-center"}`}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="nav-rail-sections"
          aria-label={expanded ? "Collapse the navigation rail" : "Expand the navigation rail"}
          title={expanded ? "Collapse the navigation rail (Ctrl+\\)" : "Expand the navigation rail (Ctrl+\\)"}
          onClick={() => setExpanded(!expanded)}
          className={shellToolClass({ className: "size-8" })}
        >
          {expanded ? <PanelLeftClose size={SHELL_RAIL_ICON} aria-hidden /> : <PanelLeftOpen size={SHELL_RAIL_ICON} aria-hidden />}
        </button>
      </div>

      <div id="nav-rail-sections" role="list" className="flex min-h-0 flex-1 flex-col items-stretch gap-1 overflow-y-auto">
        {NAV_SECTIONS.map((item) => {
          const badge = badgeFor(item.to);
          return (
            <div role="listitem" key={item.key} className="flex justify-center">
              <NavLink
                to={item.to}
                title={expanded ? item.description : `${item.label} — ${item.description}`}
                className={({ isActive }) =>
                  shellToolClass({
                    active: isActive,
                    className: expanded
                      ? "group h-8 w-full justify-start gap-2.5 px-2.5"
                      : "group size-9",
                  })
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative flex size-5 shrink-0 items-center justify-center">
                      {ICONS[item.to]}
                      {/* In the collapsed rail the count rides the icon, so the
                          badge does not need the extra width. */}
                      {!expanded && badge !== undefined && (
                        <span className="num absolute -right-1.5 -top-1.5 min-w-3.5 rounded-full bg-ev-accent px-1 text-[9px] leading-3.5 text-white">
                          {badge}
                        </span>
                      )}
                    </span>
                    {expanded && (
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate text-base font-medium">{item.label}</span>
                        {badge !== undefined && (
                          <span className="num ml-auto rounded bg-ev-accent px-1.5 text-micro leading-4 text-white">
                            {badge}
                          </span>
                        )}
                      </span>
                    )}
                    <span className="sr-only">{item.label}</span>
                    {isActive && (
                      <span
                        className="absolute left-0 top-1.5 h-5 w-0.5 rounded bg-ev-accent"
                        aria-hidden
                      />
                    )}
                    {/* Hover/focus flyout: the collapsed rail is icon-only, so
                        the label and the one-line description appear beside it
                        rather than as a bare browser tooltip. */}
                    {!expanded && (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute left-full z-[var(--z-dropdown)] ml-1.5 hidden w-52 rounded border border-ev-line bg-ev-panel px-2 py-1.5 text-left shadow-xl group-hover:block group-focus-visible:block"
                      >
                        <span className="block text-base font-medium text-ev-strong">{item.label}</span>
                        <span className="block text-dense text-ev-muted">{item.description}</span>
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </div>
          );
        })}
      </div>

      {/* The chord hint: the rail's own keyboard language, stated once. */}
      {expanded && (
        <div className="shrink-0 border-t border-ev-raised px-3 pt-2 text-micro text-ev-faint">
          <span className="block">Alt+1–8 to jump</span>
          <span className="block">Ctrl+Tab to cycle</span>
        </div>
      )}
    </nav>
  );
}

/** Icons the chevron hints reuse, kept next to the rail that shows them. */
export { ChevronLeft, ChevronRight };
