import { describe, expect, it } from "vitest";
import { hma } from "./helpers.js";

describe("hma warm-up", () => {
  it("stays null until the smoothing window holds real values", () => {
    const period = 16;
    const sqrtP = 4;
    const out = hma(Array.from({ length: 40 }, (_, i) => 100 + i), period);
    const firstValid = out.findIndex((v) => v !== null);
    // WMA(n) needs 15 bars, then WMA(sqrt n) needs 3 more raw values.
    expect(firstValid).toBe(period - 1 + sqrtP - 1);
  });
});
