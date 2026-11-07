import { describe, expect, it } from "vitest";

import { NAV_SECTIONS } from "./nav";
import { cycleSection, sectionForDigit, sectionIndex } from "./sectionCycle";

/**
 * Keyboard navigation between sections.
 *
 * The maths is separated from the key handling so the cycle can be pinned
 * without a DOM: a rail that jumps to the wrong section is worse than one
 * that does not jump at all.
 */

describe("sectionIndex", () => {
  it("finds a section by its path", () => {
    expect(sectionIndex("/markets")).toBe(1);
    expect(sectionIndex("/settings")).toBe(7);
  });

  it("returns -1 for a path that is not a section", () => {
    expect(sectionIndex("/nope")).toBe(-1);
    expect(sectionIndex("/")).toBe(-1);
  });
});

describe("cycleSection", () => {
  it("steps forward through the sections", () => {
    expect(cycleSection("/chart", 1)).toBe("/markets");
    expect(cycleSection("/markets", 1)).toBe("/trade");
  });

  it("wraps around the end", () => {
    expect(cycleSection("/settings", 1)).toBe("/chart");
  });

  it("steps backward through the sections", () => {
    expect(cycleSection("/chart", -1)).toBe("/settings");
    expect(cycleSection("/trade", -1)).toBe("/markets");
  });

  it("starts at the first section when the current path is unknown", () => {
    expect(cycleSection("/nope", 1)).toBe("/chart");
    expect(cycleSection("/nope", -1)).toBe("/settings");
  });

  it("only ever returns a real section", () => {
    for (const section of NAV_SECTIONS) {
      expect(NAV_SECTIONS.map((s) => s.to)).toContain(cycleSection(section.to, 1));
      expect(NAV_SECTIONS.map((s) => s.to)).toContain(cycleSection(section.to, -1));
    }
  });
});

describe("sectionForDigit", () => {
  it("maps Alt+1 to the first section and Alt+8 to the last", () => {
    expect(sectionForDigit(1)).toBe("/chart");
    expect(sectionForDigit(8)).toBe("/settings");
  });

  it("returns undefined for a digit outside the rail", () => {
    expect(sectionForDigit(0)).toBeUndefined();
    expect(sectionForDigit(9)).toBeUndefined();
  });
});
