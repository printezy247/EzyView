import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { BookOpen, Code, LineChart, Newspaper, Settings, Sigma } from "lucide-react";
import { NAV_ITEMS } from "./nav";

/** Left-edge section rail: one lit icon per destination, in spec order. */
const ICONS: Record<string, ReactNode> = {
  "/chart": <LineChart size={17} aria-hidden />,
  "/journal": <BookOpen size={17} aria-hidden />,
  "/fundamentals": <Newspaper size={17} aria-hidden />,
  "/options": <Sigma size={17} aria-hidden />,
  "/pine": <Code size={17} aria-hidden />,
  "/settings": <Settings size={17} aria-hidden />,
};

export function NavRail() {
  return (
    <nav aria-label="Sections" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-ev-raised py-2">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          title={item.label}
          className={({ isActive }) =>
            `relative flex size-9 items-center justify-center rounded ${
              isActive ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {ICONS[item.to]}
              <span className="sr-only">{item.label}</span>
              {isActive && <span className="absolute left-0 top-1.5 h-5 w-0.5 rounded bg-ev-accent" aria-hidden />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
