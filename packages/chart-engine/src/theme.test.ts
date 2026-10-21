import { describe, expect, it } from "vitest";

import { CHART_THEMES } from "./theme.js";

/**
 * The session band is a theme token like any other: it has to exist in every
 * palette, and it has to be translucent enough to read as background rather
 * than as a second price series.
 */

describe("chart themes", () => {
  it("gives every palette a session band", () => {
    for (const [name, theme] of Object.entries(CHART_THEMES)) {
      expect(theme.sessionBand, name).toBeTruthy();
    }
  });

  it("keeps the session band translucent", () => {
    for (const [name, theme] of Object.entries(CHART_THEMES)) {
      expect(theme.sessionBand, name).toMatch(/^rgba\(/);
      const alpha = Number(/rgba\([^,]+,[^,]+,[^,]+,([\d.]+)\)/.exec(theme.sessionBand)?.[1] ?? "1");
      expect(alpha, name).toBeGreaterThan(0);
      expect(alpha, name).toBeLessThan(0.35);
    }
  });
});
