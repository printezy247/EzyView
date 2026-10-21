import { describe, expect, it } from "vitest";

import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  CONTROL_HEIGHT,
  buttonClass,
  chipClass,
  iconButtonClass,
  inputClass,
  rowClass,
} from "./classNames";

/**
 * The shared control classes are the contract that keeps the app compact and
 * uniform: one height scale, one radius, one type size. Components read these
 * instead of redeclaring `const btn` per file, so a drift shows up here rather
 * than as a mismatch the user has to spot.
 */

describe("control scale is uniform", () => {
  it("has exactly three heights, all on the 4px grid", () => {
    expect(Object.values(CONTROL_HEIGHT)).toEqual([24, 28, 32]);
    // >= 24px keeps desktop pointer targets usable (not touch-sized, but not a
    // 16px hit area either).
    for (const px of Object.values(CONTROL_HEIGHT)) {
      expect(px % 4).toBe(0);
      expect(px).toBeGreaterThanOrEqual(24);
    }
  });

  it("gives every button size its height, and every variant its colours", () => {
    for (const [size, cls] of Object.entries(BUTTON_SIZES)) {
      expect(cls, size).toMatch(/h-6|h-7|h-8/);
      expect(cls, size).toMatch(/text-dense|text-base/);
      expect(cls, size).toContain("rounded");
    }
    for (const [variant, cls] of Object.entries(BUTTON_VARIANTS)) {
      expect(cls, variant).toMatch(/bg-ev-|border-ev-/);
    }
  });

  it("uses the type ramp, never an arbitrary pixel size", () => {
    const all = [
      buttonClass(),
      iconButtonClass(),
      inputClass(),
      chipClass(),
      rowClass(),
    ].join(" ");
    expect(all).not.toMatch(/text-\[\d+px\]/);
    expect(all).toMatch(/text-base|text-dense|text-micro/);
  });

  it("keeps one interactive radius across controls", () => {
    for (const cls of [buttonClass(), inputClass(), chipClass()]) {
      expect(cls).toContain("rounded");
    }
  });

  it("merges caller overrides instead of concatenating conflicts", () => {
    // tailwind-merge wins: the last height utility is the one that survives.
    expect(buttonClass({ size: "lg", className: "h-7" })).toContain("h-7");
    expect(buttonClass({ size: "lg", className: "h-7" })).not.toContain("h-8");
  });
});

describe("variants and tones", () => {
  it("defaults to the medium, solid button", () => {
    expect(buttonClass()).toContain("bg-ev-accent");
    expect(buttonClass()).toContain("h-7");
  });

  it("paints the primary button in the brand red with white text", () => {
    const primary = buttonClass({ variant: "solid" });
    expect(primary).toContain("bg-ev-accent");
    expect(primary).toContain("text-white");
  });

  it("never paints a button with a colour that is not a token", () => {
    for (const variant of ["solid", "outline", "ghost", "danger"] as const) {
      const cls = buttonClass({ variant });
      expect(cls, variant).not.toMatch(/#[0-9a-f]{3,6}/i);
      expect(cls, variant).not.toMatch(/rgba?\(/);
    }
  });

  it("marks the danger variant with the down token, not a literal red", () => {
    expect(buttonClass({ variant: "danger" })).toContain("text-ev-down");
  });
});

describe("tables and rows", () => {
  it("ships a dense and a comfortable row, both explicitly sized", () => {
    expect(rowClass()).toContain("h-6");
    expect(rowClass({ density: "comfortable" })).toContain("h-8");
  });

  it("keeps row numbers tabular so columns line up", () => {
    expect(rowClass()).toContain("num");
  });
});
