import { describe, expect, it } from "vitest";
import { summarizeChart } from "./chartSummary";

const bar = (time: number, open: number, high: number, low: number, close: number) => ({
  time,
  open,
  high,
  low,
  close,
  volume: 10,
});

describe("summarizeChart", () => {
  it("reads out last price, change and range", () => {
    const text = summarizeChart("AAPL", "1D", [bar(1, 100, 105, 99, 104), bar(2, 104, 112, 103, 110)]);
    expect(text).toBe("AAPL 1D chart, 2 bars, last 110, up 10.00% over the range, range 99 to 112.");
  });

  it("adds the point of control when the volume profile is on", () => {
    const text = summarizeChart("AAPL", "1D", [bar(1, 100, 100, 100, 100)], true);
    expect(text).toContain("volume point of control 100");
  });

  it("says when nothing is loaded", () => {
    expect(summarizeChart("AAPL", "1D", [])).toBe("AAPL 1D chart, no data loaded.");
  });
});
