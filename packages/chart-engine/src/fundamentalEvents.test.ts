import { describe, expect, it } from "vitest";
import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import {
  mergeMarkerLayers,
  toFundamentalLines,
  toFundamentalMarkers,
  type FundamentalEventOverlay,
} from "./host.js";

const t = (n: number): UTCTimestamp => n as UTCTimestamp;

const scriptMarker = (time: number): SeriesMarker<Time> => ({
  time: t(time),
  position: "belowBar",
  shape: "circle",
  color: "#2962ff",
});

const overlay = (o: Partial<FundamentalEventOverlay> = {}): FundamentalEventOverlay => ({
  markers: o.markers ?? [],
  lines: o.lines ?? [],
});

describe("mergeMarkerLayers", () => {
  it("returns the script layer alone when fundamentals are empty", () => {
    const script = [scriptMarker(200), scriptMarker(100)];
    expect(mergeMarkerLayers(script, [])).toEqual([...script].sort((a, b) => Number(a.time) - Number(b.time)));
  });

  it("returns the fundamentals layer alone when the script layer is empty", () => {
    const fund = toFundamentalMarkers([{ time: 300, title: "AAPL", kind: "earnings" }]);
    expect(mergeMarkerLayers([], fund)).toEqual(fund);
  });

  it("composites script ∪ fundamental sorted by time ascending", () => {
    const script = [scriptMarker(300), scriptMarker(100)];
    const fund = toFundamentalMarkers([
      { time: 200, title: "CPI", kind: "event", impact: "high" },
      { time: 50, title: "AAPL", kind: "earnings" },
    ]);
    const merged = mergeMarkerLayers(script, fund);
    expect(merged.map((m) => Number(m.time))).toEqual([50, 100, 200, 300]);
  });

  it("replacing fundamentals leaves the script layer intact", () => {
    const script = [scriptMarker(100), scriptMarker(200)];
    const first = mergeMarkerLayers(
      script,
      toFundamentalMarkers([{ time: 150, title: "FOMC", kind: "event", impact: "high" }]),
    );
    expect(first).toHaveLength(3);
    // Clearing fundamentals (empty overlay) restores exactly the script layer.
    const cleared = mergeMarkerLayers(script, []);
    expect(cleared).toEqual(mergeMarkerLayers(script, []));
    expect(cleared.map((m) => Number(m.time))).toEqual([100, 200]);
    // The script array itself was never mutated by either merge.
    expect(script.map((m) => Number(m.time))).toEqual([100, 200]);
  });

  it("keeps script markers first among equal times (stable sort)", () => {
    const script = [scriptMarker(100)];
    const fund = toFundamentalMarkers([{ time: 100, title: "E", kind: "earnings" }]);
    const merged = mergeMarkerLayers(script, fund);
    expect(merged[0]).toBe(script[0]);
  });
});

describe("toFundamentalMarkers", () => {
  it("maps earnings to an amber circle and events to a square coloured by impact", () => {
    const layer = toFundamentalMarkers([
      { time: 10, title: "AAPL", kind: "earnings" },
      { time: 20, title: "CPI", kind: "event", impact: "high" },
      { time: 30, title: "Claims", kind: "event", impact: "medium" },
      { time: 40, title: "Inventory", kind: "event", impact: "low" },
    ]);
    expect(layer).toEqual([
      { time: t(10), position: "aboveBar", shape: "circle", color: "#f0b90b" },
      { time: t(20), position: "aboveBar", shape: "square", color: "#f23645" },
      { time: t(30), position: "aboveBar", shape: "square", color: "#ff9800" },
      { time: t(40), position: "aboveBar", shape: "square", color: "#787b86" },
    ]);
  });

  it("sorts by time ascending and treats a missing impact as high", () => {
    const layer = toFundamentalMarkers([
      { time: 5, title: "B", kind: "event" },
      { time: 1, title: "A", kind: "earnings" },
    ]);
    expect(layer.map((m) => Number(m.time))).toEqual([1, 5]);
    expect(layer[0]!.color).toBe("#f0b90b");
    expect(layer[1]!.color).toBe("#f23645");
  });

  it("maps the data-adapters `none` impact to the low grey", () => {
    const layer = toFundamentalMarkers([{ time: 1, title: "X", kind: "event", impact: "none" }]);
    expect(layer[0]!.color).toBe("#787b86");
  });
});

describe("toFundamentalLines", () => {
  it("colours a line from the event marker at the same time, defaulting to high red", () => {
    const lines = toFundamentalLines(
      overlay({
        markers: [
          { time: 10, title: "CPI", kind: "event", impact: "medium" },
          { time: 20, title: "FOMC", kind: "event", impact: "high" },
        ],
        lines: [10, 20, 99],
      }),
    );
    expect(lines).toEqual([
      { time: 10, color: "#ff9800" },
      { time: 20, color: "#f23645" },
      // No marker at 99: default to the high-impact red.
      { time: 99, color: "#f23645" },
    ]);
  });

  it("ignores earnings markers when matching line colours", () => {
    const lines = toFundamentalLines(
      overlay({
        markers: [{ time: 10, title: "AAPL", kind: "earnings" }],
        lines: [10],
      }),
    );
    expect(lines).toEqual([{ time: 10, color: "#f23645" }]);
  });

  it("returns an empty list for an empty overlay", () => {
    expect(toFundamentalLines(overlay())).toEqual([]);
  });
});
