import { describe, expect, it } from "vitest";
import { nextFocusIndex } from "./Modal";

describe("nextFocusIndex", () => {
  it("wraps Tab from the last control to the first", () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, false)).toBe(1);
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    expect(nextFocusIndex(3, 0, true)).toBe(2);
  });

  it("enters at the matching end when focus is outside", () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
  });
});
