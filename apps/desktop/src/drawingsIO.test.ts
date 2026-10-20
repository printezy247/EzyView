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
    expect(json).toContain('"version": 1');
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

  it("reports which entry failed", () => {
    const res = parseDrawings('{"version":1,"drawings":[{"id":"ok","tool":"text","points":[{"time":1,"price":1}],"style":{}},{"id":2}]}');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/1/); // names the bad index
  });
});
