/**
 * EzyView brand palette — Investing.com's system, not TradingView's.
 *
 * Measured from investing.com (Oct 2026): main red `#d91400`, market green
 * `#0ea600`, link blue `#1256a0`, gold `#b19e00` / `#f2a93b`, dark chrome
 * `#181c21` over a white content canvas, Inter as the primary typeface.
 *
 * This module is the single source of truth: `styles.css` carries the same
 * values as CSS custom properties, and `./theme.ts` derives the chart palette
 * from here, so a chart and its surrounding shell can never drift apart.
 *
 * ponytail: the CSS block in `styles.css` is hand-kept in sync with these
 * values (Tailwind v4 has no build-time hook from TS to `@theme`). The
 * duplicated token names are covered by `brand.test.ts`; if a token is added
 * here, add it there too.
 */

/** Named UI themes. `dark` is the Investing.com dark terminal, `light` the web. */
export type ThemeName = "dark" | "light" | "tokyo";

export const THEME_NAMES: readonly ThemeName[] = ["dark", "light", "tokyo"] as const;

/** Every colour a surface can ask for. Keys map to `--ev-<kebab-case>`. */
export interface ThemeColors {
  /** App canvas behind the panels. */
  bg: string;
  /** Panels, tables, dialogs. */
  panel: string;
  /** Hover rows and popups. */
  raised: string;
  /** Top nav bar and rails — the Investing.com dark-chrome inversion. */
  chrome: string;
  /** Borders and dividers. */
  line: string;
  /** Heavier borders (hover, separators). */
  lineStrong: string;
  /** Inactive/disabled glyphs. */
  dim: string;
  /** Smallest readable text. */
  faint: string;
  /** Secondary text. */
  muted: string;
  /** Body text. */
  text: string;
  /** Emphasised text. */
  strong: string;
  /** Brand red: primary buttons, active states, negative/bid colour. */
  accent: string;
  /** Pressed/hover brand red. */
  accentHover: string;
  /** Brand red legible on a dark panel (AA). */
  accentText: string;
  /** Investing.com market green: up, positive, bid. */
  up: string;
  /** Investing.com market red: down, negative, ask. */
  down: string;
  /** Filled up badges (white text on top). */
  upSolid: string;
  /** Filled down badges (white text on top). */
  downSolid: string;
  /** Links, selections and focus rings. Never the brand red. */
  link: string;
  /** Warning / calendar impact. Logo gold. */
  warn: string;
  /** Secondary highlight (raw values, secondary impact). */
  orange: string;
}

/** Investing.com dark terminal (default). */
export const INVEST_DARK: ThemeColors = {
  bg: "#12161d",
  panel: "#181c21",
  raised: "#22272f",
  chrome: "#0e1216",
  line: "#2a2f38",
  lineStrong: "#3a4049",
  dim: "#4a4f59",
  faint: "#8b909a",
  muted: "#aab0ba",
  text: "#d8dce2",
  strong: "#ffffff",
  accent: "#d91400",
  accentHover: "#b91100",
  accentText: "#ff4b3e",
  up: "#0ea600",
  down: "#d91400",
  upSolid: "#0a7d00",
  downSolid: "#b91100",
  link: "#4a90e2",
  warn: "#f2a93b",
  orange: "#ff9800",
};

/** Investing.com light: clean light terminal palette. */
export const INVEST_LIGHT: ThemeColors = {
  bg: "#ffffff",
  panel: "#f7f8fa",
  raised: "#eceff2",
  chrome: "#f0f3fa",
  line: "#e2e5ea",
  lineStrong: "#c9cdd4",
  dim: "#b2b5be",
  faint: "#6b7078",
  muted: "#4a4e56",
  text: "#1b1f26",
  strong: "#000000",
  accent: "#d91400",
  accentHover: "#b91100",
  accentText: "#c11200",
  up: "#0ea600",
  down: "#d91400",
  upSolid: "#0a7d00",
  downSolid: "#b91100",
  link: "#1256a0",
  warn: "#8a7000",
  orange: "#b1560f",
};

/** Tokyo Night — the optional indigo theme, on the same red-accent system. */
export const TOKYO: ThemeColors = {
  bg: "#1a1b26",
  panel: "#24283b",
  raised: "#292e42",
  chrome: "#16161e",
  line: "#3b4261",
  lineStrong: "#565f89",
  dim: "#565f89",
  faint: "#787c99",
  muted: "#9aa5ce",
  text: "#c0caf5",
  strong: "#ffffff",
  accent: "#d91400",
  accentHover: "#b91100",
  accentText: "#ff4b3e",
  up: "#9ece6a",
  down: "#f7768e",
  upSolid: "#4c7a3f",
  downSolid: "#a53a4a",
  link: "#7aa2f7",
  warn: "#e0af68",
  orange: "#ff9e64",
};

const BY_NAME: Record<ThemeName, ThemeColors> = {
  dark: INVEST_DARK,
  light: INVEST_LIGHT,
  tokyo: TOKYO,
};

/** Narrows an arbitrary string (route, stored setting) to a known theme. */
export function isThemeName(value: string): value is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(value);
}

/** The palette for a theme name. */
export function themeColors(name: ThemeName): ThemeColors {
  return BY_NAME[name];
}

const kebab = (key: string): string => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * The palette as CSS custom properties (`--ev-*`). `styles.css` declares the
 * same set by hand; this export is what a runtime theme switch would write if
 * the app ever themes without a reload.
 */
export function themeSurface(colors: ThemeColors): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) out[`--ev-${kebab(key)}`] = value;
  return out;
}

/** The background colour an OS window chrome should use for a theme. */
export function themeWindowColor(name: ThemeName): string {
  return themeColors(name).bg;
}
