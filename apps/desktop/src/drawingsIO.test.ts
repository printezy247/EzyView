import { describe, expect, it } from "vitest";
import { parseDrawings, serializeDrawings } from "./drawingsIO";
import { DEFAULT_DRAWING_STYLE, type Drawing } from "@ezyview/drawing-tools";

const d: Drawing = {
  id: "x",
  tool: "horizontal_line",
  points: [{ time: 1, price: 2 }],
  style: { ...DEFAULT_DRAWING_STYLE },
  locked: true,
  name: "Level",
};

describe("drawingsIO", () => {
  it("round-trips drawings with extra fields intact", () => {
    const parsed = parseDrawings(serializeDrawings([d]));
    expect(parsed).toEqual({ ok: true, drawings: [d] });
  });

  it("pretty-prints a versioned envelope", () => {
    const json = serializeDrawings([d]);
    expect(json).toContain('"version": 2');
    expect(json).toContain("\n"); // pretty-printed, not a single line
  });

  it("rejects non-JSON and non-envelope input", () => {
    expect(parseDrawings("not json").ok).toBe(false);
    expect(parseDrawings('{"drawings": 1}').ok).toBe(false);
    expect(parseDrawings("[1,2]").ok).toBe(false);
  });

  it("rejects entries missing a string id or known tool", () => {
    expect(parseDrawings('{"version":1,"drawings":[{"id":1}]}').ok).toBe(false);
    expect(
      parseDrawings('{"version":1,"drawings":[{"id":"a","tool":"no_such_tool","points":[],"style":{}}]}').ok,
    ).toBe(false);
  });

  it("rejects non-finite or non-numeric point coordinates", () => {
    const badTime =
      '{"version":1,"drawings":[{"id":"a","tool":"trend_line","points":[{"time":"x","price":1}],"style":{}}]}';
    const badPrice =
      '{"version":1,"drawings":[{"id":"a","tool":"trend_line","points":[{"time":1,"price":null}],"style":{}}]}';
    expect(parseDrawings(badTime).ok).toBe(false);
    expect(parseDrawings(badPrice).ok).toBe(false);
  });

  it("preserves the TradingView style fields and timeframe visibility", () => {
    const rich: Drawing = {
      id: "rich",
      tool: "fib_retracement",
      points: [
        { time: 1, price: 100 },
        { time: 2, price: 200 },
      ],
      style: {
        ...DEFAULT_DRAWING_STYLE,
        opacity: 80,
        fillOpacity: 35,
        extendRight: true,
        showStats: true,
        fontWeight: "bold",
        reverse: true,
        fibLevels: [{ ratio: 0.5, label: "50%", enabled: true, color: "#ff0000" }],
      },
      visibility: { minutes: false, hours: true },
    };
    const parsed = parseDrawings(serializeDrawings([rich]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.drawings[0]?.style.opacity).toBe(80);
    expect(parsed.drawings[0]?.style.fibLevels?.[0]?.color).toBe("#ff0000");
    expect(parsed.drawings[0]?.visibility).toEqual({ minutes: false, hours: true });
  });

  it("migrates a v1 drawing and keeps its v2 fields optional", () => {
    const legacy = JSON.stringify({
      version: 1,
      drawings: [{ id: "old", tool: "trend_line", points: [{ time: 1, price: 2 }], style: { color: "#fff", width: 1, lineStyle: "solid" } }],
    });
    const parsed = parseDrawings(legacy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.drawings[0]?.style.color).toBe("#fff");
    expect(parsed.drawings[0]?.visibility).toBeUndefined();
    // Defaults fill in the fields the file predates.
    expect(parsed.drawings[0]?.style.showLabels).toBe(true);
    expect(parsed.drawings[0]?.groupId).toBeUndefined();
    expect(parsed.drawings[0]?.zIndex).toBeUndefined();
  });

  it("round-trips group, paint order, pattern and image metadata", () => {
    const rich: Drawing = {
      ...d,
      id: "v2",
      tool: "xabcd",
      points: [
        { time: 1, price: 100 },
        { time: 2, price: 120 },
        { time: 3, price: 110 },
        { time: 4, price: 130 },
        { time: 5, price: 105 },
      ],
      groupId: "g1",
      zIndex: 7,
      scale: "screen",
      pattern: { kind: "harmonic", ratios: { "0": 0.618, "1": 1.27 }, labels: ["X", "A", "B", "C", "D"] },
      image: { assetId: "img_1", width: 640, height: 360, lockAspect: true },
    };
    const parsed = parseDrawings(serializeDrawings([rich]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.drawings[0]?.groupId).toBe("g1");
    expect(parsed.drawings[0]?.zIndex).toBe(7);
    expect(parsed.drawings[0]?.scale).toBe("screen");
    expect(parsed.drawings[0]?.pattern?.ratios?.["0"]).toBe(0.618);
    expect(parsed.drawings[0]?.image?.assetId).toBe("img_1");
  });

  it("rejects malformed v2 metadata instead of trusting it", () => {
    const base = { id: "a", tool: "trend_line", points: [{ time: 1, price: 1 }], style: {} };
    expect(parseDrawings(JSON.stringify({ version: 2, drawings: [{ ...base, groupId: "" }] })).ok).toBe(false);
    expect(parseDrawings(JSON.stringify({ version: 2, drawings: [{ ...base, zIndex: "front" }] })).ok).toBe(false);
    expect(parseDrawings(JSON.stringify({ version: 2, drawings: [{ ...base, scale: "page" }] })).ok).toBe(false);
    expect(parseDrawings(JSON.stringify({ version: 2, drawings: [{ ...base, image: { assetId: "" } }] })).ok).toBe(false);
  });

  it("rejects malformed visibility values instead of trusting them", () => {
    const bad =
      '{"version":1,"drawings":[{"id":"a","tool":"trend_line","points":[{"time":1,"price":1}],"style":{},"visibility":{"minutes":"no"}}]}';
    expect(parseDrawings(bad).ok).toBe(false);
    expect(parseDrawings('{"version":1,"drawings":[{"id":"a","tool":"trend_line","points":[{"time":1,"price":1}],"style":{},"visibility":[]}]}').ok).toBe(false);
  });

  it("reports which entry failed", () => {
    const res = parseDrawings('{"version":1,"drawings":[{"id":"ok","tool":"text","points":[{"time":1,"price":1}],"style":{}},{"id":2}]}');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/1/); // names the bad index
  });

  it("version gate: a v3 file says 'newer format'; v1 and v2 files load", () => {
    const v3 = JSON.stringify({ version: 3, drawings: [] });
    const resV3 = parseDrawings(v3);
    expect(resV3.ok).toBe(false);
    if (!resV3.ok) {
      expect(resV3.error).toContain("newer format");
    }

    expect(parseDrawings(JSON.stringify({ version: 1, drawings: [d] })).ok).toBe(true);
    expect(parseDrawings(JSON.stringify({ version: 2, drawings: [d] })).ok).toBe(true);
  });

  it("storage budgets: import over drawing cap rejected with message", () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => ({
      ...d,
      id: `d_${i}`,
    }));
    const res = parseDrawings(JSON.stringify({ version: 1, drawings: tooMany }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/drawings could not be saved|limit/i);
    }
  });

  it("storage budgets: stroke over 2k points rejected on import", () => {
    const hugePoints = Array.from({ length: 2001 }, (_, i) => ({ time: i, price: i }));
    const hugeDrawing = { ...d, tool: "brush" as const, points: hugePoints };
    const res = parseDrawings(JSON.stringify({ version: 1, drawings: [hugeDrawing] }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/limit/i);
    }
  });
});
