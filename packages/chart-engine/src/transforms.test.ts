import { describe, expect, it } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import { lineBreak, rangeBars } from "./transforms.js";

const candle = (time: number, close: number, open = close - 1): Candle => ({
  time,
  open,
  high: Math.max(open, close) + 1,
  low: Math.min(open, close) - 1,
  close,
  volume: 1,
});

describe("lineBreak", () => {
  it("prints a line only when the close clears the last N lines", () => {
    const bars = lineBreak(
      [candle(1, 10), candle(2, 11), candle(3, 12), candle(4, 13), candle(5, 12.5), candle(6, 9)],
      3,
    );
    // Bars 1..3 print (each clears the earlier highs), 4 only matches the
    // window high, 5 makes no new line, 6 breaks the low.
    expect(bars.length).toBeGreaterThan(3);
    expect(bars[0]!.time).toBe(1);
    expect(bars.at(-1)!.up).toBe(false);
  });

  it("emits nothing for a flat market after the first line", () => {
    const bars = lineBreak([candle(1, 10), candle(2, 10), candle(3, 10), candle(4, 10)], 3);
    expect(bars).toHaveLength(1);
  });

  it("is capped so a pathological series cannot freeze the chart", () => {
    const candles = Array.from({ length: 9000 }, (_, i) => candle(i + 1, i + 1));
    expect(lineBreak(candles, 2).length).toBeLessThanOrEqual(5000);
  });
});

describe("rangeBars", () => {
  it("splits a move into equal-height bars", () => {
    const bars = rangeBars([candle(10, 110, 100)], 2);
    expect(bars).toHaveLength(5);
    expect(bars.every((b) => Math.abs(b.close - b.open) === 2)).toBe(true);
    expect(bars[0]!.open).toBe(100);
    expect(bars.at(-1)!.close).toBe(110);
  });

  it("handles a falling market with down bars", () => {
    const bars = rangeBars([candle(10, 90, 100)], 2);
    expect(bars).toHaveLength(5);
    expect(bars.every((b) => !b.up)).toBe(true);
  });

  it("ignores a move smaller than one range", () => {
    expect(rangeBars([candle(1, 100.5, 100)], 2)).toHaveLength(0);
  });
});
