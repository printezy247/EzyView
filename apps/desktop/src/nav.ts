/**
 * Route table and last-route persistence for the shell.
 *
 * The redesign gives every category its own destination (eight of them) and
 * every feature within a category a page or a sheet. Paths that existed before
 * the redesign stay valid forever as aliases, so a persisted last route, a
 * bookmark or a shared deep link still lands on the right screen.
 */

export const ROUTE_PATHS = [
  "/chart",
  "/markets",
  "/trade",
  "/research",
  "/journal",
  "/strategies",
  "/alerts",
  "/settings",
] as const;

export type RoutePath = (typeof ROUTE_PATHS)[number];

export interface NavSection {
  to: RoutePath;
  label: string;
  /** One line for the rail flyout and the command palette. */
  description: string;
  /** Doesn't need a route: today's tooling (alerts, exports) has no MCP hook. */
  key: string;
}

/** Left-rail order; icons live in NavRail.tsx. */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    to: "/chart",
    label: "Terminal",
    description: "Charts, drawings, replay, depth of market",
    key: "nav-chart",
  },
  {
    to: "/markets",
    label: "Markets",
    description: "Watchlists, screener and heatmap",
    key: "nav-markets",
  },
  {
    to: "/trade",
    label: "Trade",
    description: "Order ticket, positions and the blotter",
    key: "nav-trade",
  },
  {
    to: "/research",
    label: "Research",
    description: "Fundamentals, options chain, news and calendars",
    key: "nav-research",
  },
  {
    to: "/journal",
    label: "Journal",
    description: "Trade log, calendar, stats and reviews",
    key: "nav-journal",
  },
  {
    to: "/strategies",
    label: "Strategies",
    description: "Pine editor, strategy tester and optimization",
    key: "nav-strategies",
  },
  {
    to: "/alerts",
    label: "Alerts",
    description: "Price alerts and their firing history",
    key: "nav-alerts",
  },
  {
    to: "/settings",
    label: "Settings",
    description: "Connection, broker, layout and appearance",
    key: "nav-settings",
  },
] as const;

/** Alias kept for callers that only need the rail order. */
export const NAV_ITEMS = NAV_SECTIONS;

/**
 * Panels that used to be chart overlays and are now destinations. Callers use
 * this to link out of the chart without hardcoding a path.
 */
export const PANEL_ROUTES = {
  journal: "/journal",
  research: "/research",
  /** Was `/fundamentals`; the fundamentals tab of the Research page. */
  fundamentals: "/research",
  /** Was `/options`; the options tab of the Research page. */
  options: "/research",
  /** Was `/pine`. */
  pine: "/strategies",
  markets: "/markets",
  trade: "/trade",
  alerts: "/alerts",
} as const satisfies Record<string, RoutePath>;

/**
 * Pre-redesign paths, mapped onto the section that absorbed them. These are
 * routes as far as storage is concerned — `resolveRoute` is what changes them
 * into a destination.
 */
const LEGACY_ROUTES: Record<string, RoutePath> = {
  "/fundamentals": "/research",
  "/options": "/research",
  "/pine": "/strategies",
};

const LAST_ROUTE_KEY = "ezyview:lastRoute";

export function isKnownRoute(path: string): path is RoutePath {
  return (ROUTE_PATHS as readonly string[]).includes(path);
}

function isLegacyRoute(path: string): boolean {
  return path in LEGACY_ROUTES;
}

/** A path the app can restore to: a section, or an old path it still honours. */
export function isRestorableRoute(path: string): boolean {
  return isKnownRoute(path) || isLegacyRoute(path);
}

/** Old path → its new section; anything else passes through untouched. */
export function resolveRoute(path: string): string {
  return LEGACY_ROUTES[path] ?? path;
}

/** Known path → itself (aliases resolved); otherwise stored last route, else `/chart`. */
export function normalizePath(path: string): string {
  if (isKnownRoute(path)) return path;
  if (isLegacyRoute(path)) return resolveRoute(path);
  const stored = readLastRoute();
  return isRestorableRoute(stored) ? resolveRoute(stored) : "/chart";
}

/** Persists the resolved route; unknown paths and a missing storage are no-ops. */
export function rememberRoute(path: string): void {
  if (!isRestorableRoute(path)) return;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_ROUTE_KEY, resolveRoute(path));
  } catch {
    /* storage unavailable (private mode) — persistence is best-effort */
  }
}

/** Stored-and-known → its section; otherwise `/chart`. */
export function readLastRoute(): string {
  if (typeof localStorage === "undefined") return "/chart";
  try {
    const stored = localStorage.getItem(LAST_ROUTE_KEY);
    return stored !== null && isRestorableRoute(stored) ? resolveRoute(stored) : "/chart";
  } catch {
    return "/chart";
  }
}
