import type { RoutePath } from "./nav";

/**
 * Every multi-view page's tab table, in one place.
 *
 * The pages used to declare their own tabs inline, which meant the command
 * palette could only offer "Go to Markets" — never "Go to Markets →
 * Screener", and a sub-view could not be linked to. Both problems come
 * from the same cause: the tab list was a local constant.
 *
 * Declaring the tables here lets a page render its strip and the palette
 * build its commands from the same data, so a new tab is reachable in both
 * places by editing one line.
 */

export interface SectionTab {
  id: string;
  /** The tab's label, as the strip shows it. */
  label: string;
  /** One line for the palette and the breadcrumb. */
  hint: string;
}

export interface SectionTabs {
  /** The route the tab strip lives on. */
  path: RoutePath;
  /** The tab shown when the URL says nothing. */
  defaultTab: string;
  tabs: readonly SectionTab[];
}

export const SECTION_TABS: Record<string, SectionTabs> = {
  markets: {
    path: "/markets",
    defaultTab: "watchlists",
    tabs: [
      { id: "watchlists", label: "Watchlists", hint: "Quotes for the symbols you track" },
      { id: "screener", label: "Screener", hint: "Filter the market on price and change" },
      { id: "heatmap", label: "Heatmap", hint: "Performance at a glance, sized by move" },
    ],
  },
  trade: {
    path: "/trade",
    defaultTab: "ticket",
    tabs: [
      { id: "ticket", label: "Order ticket", hint: "Place a market or pending order" },
      { id: "blotter", label: "Blotter", hint: "Positions, working orders and deal history" },
      { id: "depth", label: "Depth", hint: "Depth of market around the current price" },
      { id: "fx", label: "Converter", hint: "Convert an amount between currencies" },
    ],
  },
  research: {
    path: "/research",
    defaultTab: "fundamentals",
    tabs: [
      { id: "fundamentals", label: "Fundamentals", hint: "Financials, ratios and valuation" },
      { id: "options", label: "Options", hint: "Options chain, strikes and implied volatility" },
      { id: "calendar", label: "Calendar", hint: "Earnings, dividends and economic events" },
      { id: "news", label: "News", hint: "Headlines for the symbol you are looking at" },
    ],
  },
  journal: {
    path: "/journal",
    defaultTab: "feed",
    tabs: [
      { id: "feed", label: "Feed", hint: "Every trade and note, newest first" },
      { id: "plans", label: "Plans", hint: "The setups you are working on" },
      { id: "calendar", label: "Calendar", hint: "Trading days, by result" },
      { id: "stats", label: "Stats", hint: "Win rate, expectancy and drawdown" },
      { id: "reviews", label: "Reviews", hint: "Written reviews of your trading days" },
    ],
  },
  settings: {
    path: "/settings",
    defaultTab: "connection",
    tabs: [
      { id: "connection", label: "Connection", hint: "Data provider and broker feed" },
      { id: "broker", label: "Broker", hint: "MT5 accounts and logins" },
      { id: "safety", label: "Safety", hint: "Order rails, limits and confirmations" },
      { id: "audit", label: "Audit", hint: "What the app has done, in order" },
      { id: "data", label: "Data", hint: "API keys, backups and restore" },
      { id: "appearance", label: "Appearance", hint: "Theme, density and chart events" },
      { id: "desktop", label: "Desktop", hint: "Window, tray and update behaviour" },
      { id: "diagnostics", label: "Diagnostics", hint: "Logs, crash reports and notices" },
    ],
  },
};

/** The tab table for a route, or undefined when the route has no tab strip. */
export function sectionTabsFor(path: string): SectionTabs | undefined {
  const key = path.replace(/^\//, "");
  return SECTION_TABS[key];
}
