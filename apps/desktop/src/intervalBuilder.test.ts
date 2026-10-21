import { describe, expect, it } from "vitest";

import { parseInterval, SUPPORTED_INTERVALS } from "./intervalBuilder";

/**
 * The interval builder parses what a user types into one of the resolutions the
 * data adapters actually serve. `Resolution` is a closed union, so the parser's
 * job is to accept a spelling, normalise it, and — when the request cannot be
 * served exactly — say why rather than quietly substituting something else.
 */

describe("parseInterval", () => {
  it("accepts the plain forms the resolution table uses", () => {
    expect(parseInterval("15m")).toMatchObject({ ok: true, resolution: "15m" });
    expect(parseInterval("4h")).toMatchObject({ ok: true, resolution: "4h" });
    expect(parseInterval("1D")).toMatchObject({ ok: true, resolution: "1D" });
  });

  it("is case-insensitive about a lowercase unit and accepts long words", () => {
    expect(parseInterval("4H")).toMatchObject({ ok: true, resolution: "4h" });
    expect(parseInterval("4hours")).toMatchObject({ ok: true, resolution: "4h" });
    expect(parseInterval("1 day")).toMatchObject({ ok: true, resolution: "1D" });
  });

  it("keeps M as month and m as minute, because the table distinguishes them", () => {
    expect(parseInterval("1M")).toMatchObject({ ok: true, resolution: "1M" });
    expect(parseInterval("1m")).toMatchObject({ ok: true, resolution: "1m" });
  });

  it("accepts a space between the number and the unit", () => {
    expect(parseInterval("5 m")).toMatchObject({ ok: true, resolution: "5m" });
  });

  it("treats d/w as the day and week buckets, since D and W are single values", () => {
    expect(parseInterval("1d")).toMatchObject({ ok: true, resolution: "1D" });
    expect(parseInterval("1w")).toMatchObject({ ok: true, resolution: "1W" });
  });

  it("rejects an empty or unparseable string with a reason", () => {
    expect(parseInterval("")).toMatchObject({ ok: false });
    expect(parseInterval("soon")).toMatchObject({ ok: false });
    expect(parseInterval("15")).toMatchObject({ ok: false });
  });

  it("rejects zero and negative counts", () => {
    expect(parseInterval("0m")).toMatchObject({ ok: false });
    expect(parseInterval("-5m")).toMatchObject({ ok: false });
  });

  it("reports an unsupported count instead of silently rounding to a neighbour", () => {
    const result = parseInterval("7m");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/7/);
  });

  it("suggests the nearest supported count for the same unit", () => {
    const result = parseInterval("7m");
    expect(result.ok === false && result.suggestion).toBe("5m");
  });

  it("maps a multi-day request onto the week bucket when there is no exact match", () => {
    const result = parseInterval("3d");
    expect(result.ok === false);
    expect(result.ok === false && result.suggestion).toBe("1W");
  });

  it("accepts every interval it lists as supported", () => {
    for (const r of SUPPORTED_INTERVALS) {
      expect(parseInterval(r), r).toMatchObject({ ok: true, resolution: r });
    }
  });

  it("names the resolution it settled on, for the button label", () => {
    const result = parseInterval("4h");
    expect(result.ok === true && result.label).toBe("4 hours");
  });
});

describe("SUPPORTED_INTERVALS", () => {
  it("is the resolution table's own list, deduplicated and non-empty", () => {
    expect(SUPPORTED_INTERVALS.length).toBeGreaterThan(10);
    expect(new Set(SUPPORTED_INTERVALS).size).toBe(SUPPORTED_INTERVALS.length);
  });
});
