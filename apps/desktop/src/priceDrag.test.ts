import { describe, expect, it } from "vitest";

import { HIT_SLOP_PX, hitTestLevel, moveLevel } from "./priceDrag";

/**
 * Dragging a stop or target is two pure steps — hit-test a pointer against the
 * rendered level lines, then turn a drag into a new price — so both are tested
 * without a chart. The engine is only asked to convert coordinates.
 */

const lines = [
  { id: "entry", price: 100, y: 300 },
  { id: "stop", price: 95, y: 340 },
  { id: "target", price: 110, y: 250 },
];

describe("hitTestLevel", () => {
  it("finds the line under the pointer", () => {
    expect(hitTestLevel(lines, 340)?.id).toBe("stop");
    expect(hitTestLevel(lines, 250)?.id).toBe("target");
  });

  it("returns null when the pointer is clear of every line", () => {
    expect(hitTestLevel(lines, 100)).toBeNull();
  });

  it("picks the nearest line when two are within the slop", () => {
    // 296 is 4px from entry (300) and 46px from target (250).
    expect(hitTestLevel(lines, 296)?.id).toBe("entry");
  });

  it("honours the slop band, inclusive at the edge", () => {
    expect(hitTestLevel(lines, 300 + HIT_SLOP_PX)?.id).toBe("entry");
    expect(hitTestLevel(lines, 300 + HIT_SLOP_PX + 1)).toBeNull();
  });

  it("never grabs a line that is not rendered (no y)", () => {
    expect(hitTestLevel([{ id: "off", price: 100, y: null }], 300)).toBeNull();
  });

  it("accepts a custom slop, for touch or a coarse pointer", () => {
    expect(hitTestLevel(lines, 300 + 20, 24)?.id).toBe("entry");
    expect(hitTestLevel(lines, 300 + 20, 6)).toBeNull();
  });
});

describe("moveLevel", () => {
  it("returns the dragged line's price when the pointer converts cleanly", () => {
    const hit = hitTestLevel(lines, 340)!;
    expect(moveLevel(hit, 92.5)).toBe(92.5);
  });

  it("returns null when the pointer is off the price scale", () => {
    const hit = hitTestLevel(lines, 340)!;
    expect(moveLevel(hit, null)).toBeNull();
  });

  it("refuses a non-finite price rather than writing NaN into a stop", () => {
    const hit = hitTestLevel(lines, 340)!;
    expect(moveLevel(hit, Number.NaN)).toBeNull();
    expect(moveLevel(hit, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("does not move a line the user did not grab", () => {
    const hit = hitTestLevel(lines, 250)!;
    expect(moveLevel(hit, 200)).toBe(200);
    expect(hit.id).toBe("target");
  });
});
