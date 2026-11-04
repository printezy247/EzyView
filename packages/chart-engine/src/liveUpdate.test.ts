import { describe, expect, it } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import { canUpdateFormingBar, closedBarKey, isFormingBarTick } from "./liveUpdate.js";

const bar = (time: number, close: number, volume = 1): Candle => ({
  time,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume,
});

const series = (): Candle[] => [bar(100, 10), bar(200, 12), bar(300, 15)];

describe("isFormingBarTick", () => {
  it("accepts a tick for the bar that is already last", () => {
    expect(isFormingBarTick(series(), bar(300, 16))).toBe(true);
  });

  it("rejects a tick that opens a new bar", () => {
    expect(isFormingBarTick(series(), bar(400, 16))).toBe(false);
  });

  it("rejects an empty series", () => {
    expect(isFormingBarTick([], bar(100, 10))).toBe(false);
  });
});

describe("closedBarKey", () => {
  it("does not change while the forming bar is ticked", () => {
    const before = closedBarKey(series());
    const after = closedBarKey([...series().slice(0, -1), bar(300, 99, 500)]);
    expect(after).toBe(before);
  });

  it("changes when a new bar closes the previous one", () => {
    const before = closedBarKey(series());
    const after = closedBarKey([...series(), bar(400, 16)]);
    expect(after).not.toBe(before);
  });

  it("changes when a closed bar is corrected", () => {
    const before = closedBarKey(series());
    const after = closedBarKey([bar(100, 10), bar(200, 13), bar(300, 15)]);
    expect(after).not.toBe(before);
  });

  it("distinguishes a single forming bar from a different one", () => {
    expect(closedBarKey([bar(100, 10)])).not.toBe(closedBarKey([bar(200, 10)]));
  });

  it("is stable for an empty series", () => {
    expect(closedBarKey([])).toBe("0|empty");
  });
});

describe("canUpdateFormingBar", () => {
  it("requires both a supported chart type and the same bar time", () => {
    expect(canUpdateFormingBar(series(), bar(300, 16), true)).toBe(true);
    expect(canUpdateFormingBar(series(), bar(300, 16), false)).toBe(false);
    expect(canUpdateFormingBar(series(), bar(400, 16), true)).toBe(false);
  });
});
