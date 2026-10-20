/**
 * Route table and last-route persistence for the Phase 2 shell.
 *
 * Every navigation destination is one of these six paths; unknown deep links
 * resolve to the stored last route when it is still known, otherwise /chart.
 * Writes only ever store known routes so a removed route can never loop.
 */

export const ROUTE_PATHS = ["/chart", "/journal", "/fundamentals", "/options", "/pine", "/settings"] as const;

export type RoutePath = (typeof ROUTE_PATHS)[number];

/** Left-rail order per the navigation spec; icons live in NavRail.tsx. */
export const NAV_ITEMS = [
  { to: "/chart", label: "Chart", key: "nav-chart" },
  { to: "/journal", label: "Journal", key: "nav-journal" },
  { to: "/fundamentals", label: "Fundamentals", key: "nav-fundamentals" },
  { to: "/options", label: "Options", key: "nav-options" },
  { to: "/pine", label: "Pine", key: "nav-pine" },
  { to: "/settings", label: "Settings", key: "nav-settings" },
] as const;

/** Chart bottom-slot panels that navigated away as routes. */
export const PANEL_ROUTES = {
  journal: "/journal",
  fundamentals: "/fundamentals",
  options: "/options",
  pine: "/pine",
} as const satisfies Record<string, RoutePath>;

const LAST_ROUTE_KEY = "ezyview:lastRoute";

export function isKnownRoute(path: string): path is RoutePath {
  return (ROUTE_PATHS as readonly string[]).includes(path);
}

/** Known path → itself; otherwise stored last route if known, else "/chart". */
export function normalizePath(path: string): string {
  if (isKnownRoute(path)) return path;
  const stored = readLastRoute();
  return isKnownRoute(stored) ? stored : "/chart";
}

/** Persists the last route; unknown paths and a missing storage are no-ops. */
export function rememberRoute(path: string): void {
  if (!isKnownRoute(path)) return;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_ROUTE_KEY, path);
  } catch {
    /* storage unavailable (private mode) — persistence is best-effort */
  }
}

/** Stored-and-known → it; otherwise "/chart". */
export function readLastRoute(): string {
  if (typeof localStorage === "undefined") return "/chart";
  try {
    const stored = localStorage.getItem(LAST_ROUTE_KEY);
    return stored !== null && isKnownRoute(stored) ? stored : "/chart";
  } catch {
    return "/chart";
  }
}
