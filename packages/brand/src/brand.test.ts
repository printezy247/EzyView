import { describe, expect, it } from "vitest";

import { CHART_THEMES, DARK_THEME, INDICATOR_COLORS, LIGHT_THEME, colorAt } from "@ezyview/chart-engine";
import {
  TERMINAL_DARK,
  WARM_LIGHT,
  THEME_NAMES,
  isThemeName,
  themeColors,
  themeSurface,
} from "./index";

/**
 * Brand contract: EzyView's palette is "Terminal Pro" — deep blue-black
 * surfaces, a signal-cyan accent, and market green/red kept strictly separate
 * from the brand colour.
 *
 * These tests are the guard against the accent drifting back to the old
 * Investing.com red (#d91400) or TradingView blue (#2962ff), and against the
 * market up/down colours collapsing into the accent again — they must stay
 * distinct so a red candle never reads as a brand element.
 */

// Signature colours that must never appear in app surfaces.
const BANNED_COLORS = ["#2962ff", "#131722", "#1e222d", "#d91400"];

const hexOf = (colors: object, pattern: RegExp): string | undefined => {
  const entries = Object.entries(colors) as [string, string][];
  const hit = entries.find(([k]) => pattern.test(k));
  return hit ? hit[1].toLowerCase() : undefined;
};

describe("palette is the Terminal Pro brand", () => {
  it("primes the dark themes with the signal-cyan accent", () => {
    expect(themeColors("dark").accent).toBe("#22d3ee");
    expect(themeColors("tokyo").accent).toBe("#22d3ee");
  });

  it("uses a deep cyan for the light theme so white ink stays legible", () => {
    expect(themeColors("light").accent).toBe("#0e7490");
  });

  it("keeps market up/down on green and red, distinct from the accent", () => {
    const dark = themeColors("dark");
    expect(dark.up).toBe("#22c55e");
    expect(dark.down).toBe("#ef4444");
    expect(dark.accent).not.toBe(dark.up);
    expect(dark.accent).not.toBe(dark.down);
  });

  it("keeps the terminal chrome and warm-paper light surfaces", () => {
    expect(TERMINAL_DARK.chrome).toBe("#060910");
    expect(TERMINAL_DARK.panel).toBe("#10141d");
    expect(TERMINAL_DARK.warn).toBe("#fbbf24");
    expect(WARM_LIGHT.chrome).toBe("#efe9d8");
    expect(WARM_LIGHT.bg).toBe("#faf7f0");
    expect(WARM_LIGHT.link).toBe("#1d4ed8");
  });

  it("leaves no legacy brand or TradingView colours on app surfaces", () => {
    for (const name of THEME_NAMES) {
      const flat = Object.values(themeColors(name)).join(" ").toLowerCase();
      for (const banned of BANNED_COLORS) expect(flat).not.toContain(banned);
    }
  });

  it("gives each theme a distinct link colour so focus rings never read as brand cyan", () => {
    for (const name of THEME_NAMES) {
      const colors = themeColors(name);
      expect(colors.link).not.toBe(colors.accent);
      expect(colors.link).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("emits one CSS custom property per token, prefixed --ev-", () => {
    const tokens = themeSurface(TERMINAL_DARK);
    expect(tokens["--ev-accent"]).toBe("#22d3ee");
    expect(tokens["--ev-accent-ink"]).toBe(TERMINAL_DARK.accentInk);
    expect(tokens["--ev-up"]).toBe("#22c55e");
    expect(tokens["--ev-chrome"]).toBe(TERMINAL_DARK.chrome);
    // Every token maps to a kebab-case --ev-* name.
    for (const key of Object.keys(tokens)) expect(key).toMatch(/^--ev-[a-z0-9-]+$/);
  });

  it("accepts only known theme names", () => {
    expect(isThemeName("dark")).toBe(true);
    expect(isThemeName("light")).toBe(true);
    expect(isThemeName("tokyo")).toBe(true);
    expect(isThemeName("solarized")).toBe(false);
    expect(isThemeName("")).toBe(false);
  });
});

describe("chart palette derives from the brand", () => {
  it("paints candles with the theme's market green/red", () => {
    expect(DARK_THEME.upColor).toBe("#22c55e");
    expect(DARK_THEME.downColor).toBe("#ef4444");
    expect(LIGHT_THEME.upColor).toBe("#16a34a");
    expect(LIGHT_THEME.downColor).toBe("#dc2626");
  });

  it("exposes exactly the three UI themes", () => {
    expect(Object.keys(CHART_THEMES).sort()).toEqual(["dark", "light", "tokyo"]);
    expect(CHART_THEMES.dark).toBe(DARK_THEME);
  });

  it("matches the UI theme's surface on the chart background", () => {
    expect(DARK_THEME.background).toBe(themeColors("dark").bg);
    expect(DARK_THEME.paneSeparator).toBe(themeColors("dark").line);
    expect(LIGHT_THEME.background).toBe(themeColors("light").bg);
    expect(CHART_THEMES.tokyo.background).toBe(themeColors("tokyo").bg);
  });

  it("drops TradingView blue from the indicator cycle", () => {
    expect(INDICATOR_COLORS).not.toContain("#2962ff");
    expect(colorAt(0)).toBe(INDICATOR_COLORS[0]);
    expect(colorAt(INDICATOR_COLORS.length)).toBe(INDICATOR_COLORS[0]);
  });
});

describe("colour helpers stay total", () => {
  it("returns a hex for every primitive token in every theme", () => {
    for (const name of THEME_NAMES) {
      const colors = themeColors(name);
      for (const [key, value] of Object.entries(colors)) {
        expect(value, `${name}.${key}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("names the accent, the ink on accent, and the down colour separately", () => {
    const dark = themeColors("dark");
    expect(hexOf(dark, /^accent$/)).toBe("#22d3ee");
    expect(hexOf(dark, /accentInk/)).toBe("#04222b");
    expect(hexOf(dark, /^down$/)).toBe("#ef4444");
  });
});
