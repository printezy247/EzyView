import { describe, expect, it } from "vitest";
import type { JournalEntry } from "@ezyview/journal";
import { parseSnapshot } from "../../../packages/mcp-server/src/snapshot";
import { buildSnapshot } from "./snapshot";
import type { Layout } from "./layout";

const layout = {
  id: "l1",
  name: "Gold",
  color: "#fff",
  grid: "1",
  charts: [
    {
      symbol: "OANDA:XAUUSD",
      resolution: "1D",
      chartType: "candles",
      showVolume: true,
      showGrid: true,
      theme: "dark",
      indicators: [{ uid: "u1", def: { id: "rsi" }, params: {}, colorIndex: 0 }],
      drawings: [{ id: "d1", tool: "horizontal_line", points: [], style: {} }],
    },
  ],
  activeChart: 0,
} as unknown as Layout;

const entry = (id: string, entryTime: number): JournalEntry => ({
  id,
  symbol: "XAUUSD",
  side: "long",
  qty: 1,
  entryPrice: 1,
  entryTime,
  screenshots: ["data:image/png;base64,AAAA"],
});

describe("buildSnapshot", () => {
  const snap = buildSnapshot(
    { layouts: [layout], activeLayoutId: "l1", alerts: [], watchlist: [], entries: [entry("old", 1), entry("new", 2)], notes: [] },
    5_000,
  );

  it("is accepted by the MCP reader", () => {
    expect(parseSnapshot(JSON.stringify(snap))).not.toBeNull();
  });

  it("flattens layouts to indicator ids and marks the active one", () => {
    expect(snap.layouts[0]).toMatchObject({ active: true, charts: [{ indicators: ["rsi"] }] });
    expect(snap.updatedAt).toBe(5);
  });

  it("orders journal newest first and drops screenshots", () => {
    expect(snap.journal.entries.map((e) => e.id)).toEqual(["new", "old"]);
    expect(JSON.stringify(snap)).not.toContain("base64");
  });
});
