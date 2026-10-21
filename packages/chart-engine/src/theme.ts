/**
 * Chart palette, derived from the app brand (`./brand.ts`) so the canvas and
 * the shell around it can never disagree on what "dark" means.
 */

import { type ThemeName, themeColors } from "@ezyview/brand";

export interface ChartTheme {
  background: string;
  textColor: string;
  grid: string;
  crosshair: string;
  upColor: string;
  downColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  paneSeparator: string;
}

function fromBrand(name: ThemeName): ChartTheme {
  const c = themeColors(name);
  return {
    background: c.bg,
    textColor: c.text,
    grid: c.raised,
    crosshair: c.muted,
    upColor: c.up,
    downColor: c.down,
    borderUpColor: c.up,
    borderDownColor: c.down,
    wickUpColor: c.up,
    wickDownColor: c.down,
    paneSeparator: c.line,
  };
}

/** The Investing.com dark terminal. */
export const DARK_THEME: ChartTheme = fromBrand("dark");

/** The Investing.com light web palette. */
export const LIGHT_THEME: ChartTheme = fromBrand("light");

/** Tokyo Night — the optional indigo palette. */
export const TOKYO_THEME: ChartTheme = fromBrand("tokyo");

/** Chart palettes by UI theme name. */
export const CHART_THEMES: Record<ThemeName, ChartTheme> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
  tokyo: TOKYO_THEME,
};

/**
 * Cycle through a fixed, contrast-checked palette so the Nth indicator still
 * reads against the dark background. TradingView blue is deliberately absent —
 * it is the app accent's old value and reads as "the UI", not as data.
 */
export const INDICATOR_COLORS = [
  "#f2a93b",
  "#4a90e2",
  "#4caf50",
  "#e91e63",
  "#00bcd4",
  "#9c27b0",
  "#8bc34a",
  "#ffc107",
  "#03a9f4",
  "#0ea600",
  "#795548",
  "#607d8b",
  "#cddc39",
  "#ff5722",
  "#3f51b5",
  "#009688",
];

export function colorAt(index: number): string {
  return INDICATOR_COLORS[index % INDICATOR_COLORS.length]!;
}
