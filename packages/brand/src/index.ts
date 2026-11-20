/**
 * EzyView brand palette — "Terminal Pro".
 *
 * Deep blue-black surfaces with a signal-cyan accent, semantic green/red for
 * market direction kept strictly separate from the brand colour, and JetBrains
 * Mono for every numeral. The light theme is a warm paper palette; Tokyo Night
 * keeps its indigo surfaces under the same cyan accent.
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

/** Named UI themes. `dark` is the terminal dark, `light` the warm paper theme. */
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
  /** Brand cyan: primary buttons, active states, focus rings. Never a market direction. */
  accent: string;
  /** Pressed/hover brand cyan. */
  accentHover: string;
  /** Brand cyan legible as text on a panel (AA). */
  accentText: string;
  /** Text/icon colour drawn on top of an `accent`-filled surface. */
  accentInk: string;
  /** Market green: up, positive, bid. */
  up: string;
  /** Market red: down, negative, ask. */
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

/** Terminal dark: deep blue-black chrome, signal-cyan accent (default). */
export const TERMINAL_DARK: ThemeColors = {
  bg: "#0a0d13",
  panel: "#10141d",
  raised: "#171d29",
  chrome: "#060910",
  line: "#1f2735",
  lineStrong: "#2f3a4d",
  dim: "#4c5a70",
  faint: "#7d8aa0",
  muted: "#93a0b6",
  text: "#c4cfdf",
  strong: "#eef2fa",
  accent: "#22d3ee",
  accentHover: "#06b6d4",
  accentText: "#67e8f9",
  accentInk: "#04222b",
  up: "#22c55e",
  down: "#ef4444",
  upSolid: "#15803d",
  downSolid: "#dc2626",
  link: "#60a5fa",
  warn: "#fbbf24",
  orange: "#fb923c",
};

/** Warm paper light: cream surfaces, deep cyan accent. */
export const WARM_LIGHT: ThemeColors = {
  bg: "#faf7f0",
  panel: "#f4efe4",
  raised: "#eae2d2",
  chrome: "#efe9d8",
  line: "#ddd2bd",
  lineStrong: "#c9bb9f",
  dim: "#b3a68c",
  faint: "#7d7260",
  muted: "#5f5543",
  text: "#2b2517",
  strong: "#16120a",
  accent: "#0e7490",
  accentHover: "#155e75",
  accentText: "#0e7490",
  accentInk: "#ffffff",
  up: "#16a34a",
  down: "#dc2626",
  upSolid: "#15803d",
  downSolid: "#b91c1c",
  link: "#1d4ed8",
  warn: "#a16207",
  orange: "#c2410c",
};

/** Tokyo Night — indigo surfaces under the same cyan accent system. */
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
  accent: "#22d3ee",
  accentHover: "#06b6d4",
  accentText: "#67e8f9",
  accentInk: "#04222b",
  up: "#4ade80",
  down: "#f87171",
  upSolid: "#15803d",
  downSolid: "#dc2626",
  link: "#7aa2f7",
  warn: "#fbbf24",
  orange: "#fb923c",
};

const BY_NAME: Record<ThemeName, ThemeColors> = {
  dark: TERMINAL_DARK,
  light: WARM_LIGHT,
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
