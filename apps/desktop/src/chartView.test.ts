import { describe, expect, it } from "vitest";
import { barsNeeded, formatClock, parseGoToDate, RANGE_PRESETS, rangeStart } from "./chartView";

const DAY = 86400;
// 2026-10-21T12:00:00Z
const LAST = Date.UTC(2026, 9, 21, 12) / 1000;

describe("rangeStart", () => {
  it("steps back a fixed span for day/month/year presets", () => {
    expect(rangeStart("1D", LAST)).toBe(LAST - DAY);
    expect(rangeStart("5D", LAST)).toBe(LAST - 5 * DAY);
    expect(rangeStart("1M", LAST)).toBe(LAST - 30 * DAY);
    expect(rangeStart("1Y", LAST)).toBe(LAST - 365 * DAY);
    expect(rangeStart("5Y", LAST)).toBe(LAST - 5 * 365 * DAY);
  });

  it("starts YTD at 1 January UTC of the last bar's year", () => {
    expect(rangeStart("YTD", LAST)).toBe(Date.UTC(2026, 0, 1) / 1000);
  });

  it("returns null for All (fit everything)", () => {
    expect(rangeStart("All", LAST)).toBeNull();
  });

  it("describes every preset for the hover text", () => {
    expect(RANGE_PRESETS.map((p) => p.id)).toEqual(["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "All"]);
    for (const p of RANGE_PRESETS) expect(p.description.length).toBeGreaterThan(5);
  });
});

describe("barsNeeded", () => {
  it("counts bars from a start time to the last bar, with a little slack", () => {
    expect(barsNeeded(LAST - 10 * 3600, LAST, 3600)).toBe(10 + 5);
  });

  it("caps at 5000 bars", () => {
    expect(barsNeeded(0, LAST, 60)).toBe(5000);
  });
});

describe("parseGoToDate", () => {
  it("parses YYYY-MM-DD as midnight UTC", () => {
    expect(parseGoToDate("2026-10-21")).toBe(Date.UTC(2026, 9, 21) / 1000);
  });

  it("rejects junk and impossible dates", () => {
    for (const bad of ["", "21/10/2026", "2026-13-01", "2026-02-30", "abc"]) expect(parseGoToDate(bad)).toBeNull();
  });
});

describe("formatClock", () => {
  it("formats HH:MM:SS with the zone offset label in the given timezone", () => {
    const at = Date.UTC(2026, 9, 21, 5, 26, 55);
    expect(formatClock(at, "Asia/Singapore")).toBe("13:26:55 UTC+8");
    expect(formatClock(at, "UTC")).toBe("05:26:55 UTC");
  });
});
