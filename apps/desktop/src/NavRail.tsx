import type { ReactNode } from "react";
import { NavLink } from "react-router";
import {
  BarChart3,
  Bell,
  BookOpen,
  Code,
  Globe,
  LineChart,
  Settings,
  Wallet,
} from "lucide-react";
import { NAV_SECTIONS } from "./nav";
import { SHELL_RAIL_ICON, SHELL_RAIL_WIDTH, shellToolClass } from "./ui";

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

export function NavRail() {
  return (
    <nav
      aria-label="Sections"
      className={`flex ${SHELL_RAIL_WIDTH} shrink-0 flex-col items-center gap-1 border-r border-ev-raised bg-ev-chrome py-2`}
    >
      {NAV_SECTIONS.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          title={`${item.label} — ${item.description}`}
          className={({ isActive }) => shellToolClass({ active: isActive, className: "group size-9" })}
        >
          {({ isActive }) => (
            <>
              {ICONS[item.to]}
              <span className="sr-only">{item.label}</span>
              {isActive && (
                <span
                  className="absolute left-0 top-1.5 h-5 w-0.5 rounded bg-ev-accent"
                  aria-hidden
                />
              )}
              {/* Hover/focus flyout: the rail is icon-only, so the label and the
                  one-line description appear beside it rather than as a bare
                  browser tooltip. */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full z-[var(--z-dropdown)] ml-1.5 hidden w-52 rounded border border-ev-line bg-ev-panel px-2 py-1.5 text-left shadow-xl group-hover:block group-focus-visible:block"
              >
                <span className="block text-base font-medium text-ev-strong">{item.label}</span>
                <span className="block text-dense text-ev-muted">{item.description}</span>
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
