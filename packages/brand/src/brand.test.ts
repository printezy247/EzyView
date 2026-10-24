import { describe, expect, it } from "vitest";

import { CHART_THEMES, DARK_THEME, INDICATOR_COLORS, LIGHT_THEME, colorAt } from "@ezyview/chart-engine";
import {
  INVEST_DARK,
  INVEST_LIGHT,
  THEME_NAMES,
  isThemeName,
  themeColors,
  themeSurface,
} from "./index";

/**
 * Brand contract: EzyView's palette is Investing.com's, not TradingView's.
 *
 * These tests are the guard against the accent drifting back to TradingView
 * blue (#2962ff) or the candle palette back to teal/red (#26a69a/#ef5350),
 * which is what the redesign removed.
 */

// TradingView's signature colours. None of them may appear in app surfaces.
const TRADINGVIEW_COLORS = ["#2962ff", "#131722", "#1e222d"];

const hexOf = (colors: object, pattern: RegExp): string | undefined => {
  const entries = Object.entries(colors) as [string, string][];
  const hit = entries.find(([k]) => pattern.test(k));
  return hit ? hit[1].toLowerCase() : undefined;
};

describe("palette is the Investing.com brand", () => {
  it("primes every theme with the Investing.com red accent", () => {
    for (const name of THEME_NAMES) {
      expect(themeColors(name).accent).toBe("#d91400");
    }
  });

  it("keeps market up/down on Investing.com green and red", () => {
    const dark = themeColors("dark");
    expect(dark.up).toBe("#0ea600");
    expect(dark.down).toBe("#d91400");
  });

  it("keeps the Investing.com chrome, gold and link blue", () => {
    // Chrome is the outer shell: rails/nav sit under the chrome colour, and
    // the dark theme uses #0e1216 while the light theme uses #f0f3fa.
    expect(INVEST_DARK.chrome).toBe("#0e1216");
    expect(INVEST_DARK.panel).toBe("#181c21");
    expect(INVEST_DARK.warn).toBe("#f2a93b");
    expect(INVEST_LIGHT.chrome).toBe("#f0f3fa");
    expect(INVEST_LIGHT.link).toBe("#1256a0");
  });

  it("leaves no TradingView colours on app surfaces", () => {
    for (const name of THEME_NAMES) {
      const flat = Object.values(themeColors(name)).join(" ").toLowerCase();
      for (const banned of TRADINGVIEW_COLORS) expect(flat).not.toContain(banned);
    }
  });

  it("gives each theme a distinct strong-vs-link pair so focus rings never read as brand red", () => {
    for (const name of THEME_NAMES) {
      const colors = themeColors(name);
      expect(colors.link).not.toBe(colors.accent);
      expect(colors.link).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("emits one CSS custom property per token, prefixed --ev-", () => {
    const tokens = themeSurface(INVEST_DARK);
    expect(tokens["--ev-accent"]).toBe("#d91400");
    expect(tokens["--ev-up"]).toBe("#0ea600");
    expect(tokens["--ev-chrome"]).toBe(INVEST_DARK.chrome);
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
  it("paints candles with the Investing.com green/red", () => {
    expect(DARK_THEME.upColor).toBe("#0ea600");
    expect(DARK_THEME.downColor).toBe("#d91400");
    expect(LIGHT_THEME.upColor).toBe("#0ea600");
    expect(LIGHT_THEME.downColor).toBe("#d91400");
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

  it("names the accent and the down colour separately so a test can tell them apart", () => {
    const dark = themeColors("dark");
    expect(hexOf(dark, /accent/)).toBe("#d91400");
    expect(hexOf(dark, /down/)).toBe("#d91400");
  });
});
