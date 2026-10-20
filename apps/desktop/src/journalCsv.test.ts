import { describe, expect, it } from "vitest";
import type { JournalEntry } from "@ezyview/journal";
import { entriesToCsv } from "./journalCsv";

/**
 * Pure CSV export — node environment, no localStorage. The header is a fixed
 * contract (column order Task 4's UI download relies on).
 */

const HEADER =
  "id,symbol,side,qty,entryPrice,exitPrice,entryTime,exitTime,pnl,fees,plannedRisk,setup,tags,notes,rating,source,emotion,stopPrice,targetPrice,rules";

const base: JournalEntry = {
  id: "e1",
  symbol: "EURUSD",
  side: "long",
  qty: 1,
  entryPrice: 1.1,
  entryTime: 1700000000,
};

/** The single data row: header removed, CRLF-split. */
function dataRow(entries: readonly JournalEntry[]): string[] {
  const csv = entriesToCsv(entries);
  const lines = csv.split("\r\n");
  expect(lines[0]).toBe(HEADER);
  return lines.slice(1);
}

describe("entriesToCsv", () => {
  it("empty input yields the header only", () => {
    expect(entriesToCsv([])).toBe(HEADER);
  });

  it("uses CRLF line endings with no bare LF", () => {
    const csv = entriesToCsv([base, { ...base, id: "e2" }]);
    expect(csv).toContain("\r\n");
    expect(csv.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("missing optional fields become empty cells", () => {
    const [row] = dataRow([base]);
    // 20 columns: required values filled, every optional cell (cols 8–20) empty.
    expect(row).toBe("e1,EURUSD,long,1,1.1,,1700000000" + ",".repeat(13));
  });

  it("quotes a field containing a comma", () => {
    const [row] = dataRow([{ ...base, notes: "scale in, hold runner" }]);
    expect(row).toContain('"scale in, hold runner"');
  });

  it("doubles internal quotes", () => {
    const [row] = dataRow([{ ...base, notes: 'he said "hold"' }]);
    expect(row).toContain('"he said ""hold"""');
  });

  it("quotes an embedded newline without breaking the CRLF row structure", () => {
    const csv = entriesToCsv([{ ...base, notes: "plan A\nthen plan B" }]);
    expect(csv).toContain('"plan A\nthen plan B"');
    // The embedded LF stays inside quotes; every structural break is still CRLF.
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("joins deduped tags with |", () => {
    const [row] = dataRow([{ ...base, tags: [" trend ", "trend", "breakout", "", "breakout"] }]);
    // tags is column 13 (index 12).
    expect(row?.split(",")[12]).toBe("trend|breakout");
  });

  it("leaves the tags cell empty when nothing survives dedupe", () => {
    const [row] = dataRow([{ ...base, tags: ["  ", ""] }]);
    expect(row?.split(",")[12]).toBe("");
  });

  it("joins rules as label✓/label✗ and strips | from labels", () => {
    const [row] = dataRow([
      {
        ...base,
        rules: [
          { label: "A|B", done: true },
          { label: "C", done: false },
        ],
      },
    ]);
    // rules is column 20 (index 19) — the last cell.
    expect(row?.split(",").at(-1)).toBe("A/B✓|C✗");
  });

  it("empty rules list yields an empty cell", () => {
    const [row] = dataRow([{ ...base, rules: [] }]);
    expect(row?.split(",").at(-1)).toBe("");
  });

  it("emits a full row with every column populated", () => {
    const entry: JournalEntry = {
      id: "e9",
      symbol: "BTCUSDT",
      side: "short",
      qty: 2,
      entryPrice: 65000.5,
      exitPrice: 64000,
      entryTime: 1700000000,
      exitTime: 1700003600,
      pnl: 2001,
      fees: 1.5,
      plannedRisk: 100,
      setup: "ORB",
      tags: ["a", "b"],
      notes: "text",
      rating: 4,
      source: "manual",
      emotion: "calm",
      stopPrice: 65500,
      targetPrice: 63000,
      rules: [{ label: "R1", done: true }],
    };
    const [row] = dataRow([entry]);
    expect(row).toBe(
      "e9,BTCUSDT,short,2,65000.5,64000,1700000000,1700003600,2001,1.5,100,ORB,a|b,text,4,manual,calm,65500,63000,R1✓",
    );
  });
});
