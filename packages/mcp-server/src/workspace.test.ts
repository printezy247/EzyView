import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleMessage } from "./server.js";
import { defaultSnapshotPath, parseSnapshot } from "./snapshot.js";

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const result = res!.result as { isError?: boolean; content: { text: string }[] };
  const text = result.content[0]!.text;
  return { isError: result.isError === true, text, data: result.isError ? null : JSON.parse(text) };
};

const T = Date.UTC(2026, 9, 21, 12, 0, 0) / 1000;
const SNAPSHOT = {
  format: "ezyview-workspace",
  version: 1,
  updatedAt: T,
  layouts: [
    { id: "l1", name: "Gold", grid: "1", active: true, charts: [{ symbol: "OANDA:XAUUSD", resolution: "1D", chartType: "candles", indicators: ["rsi"], drawings: [] }] },
  ],
  alerts: [
    { id: "a1", symbol: "OANDA:XAUUSD", state: "armed" },
    { id: "a2", symbol: "BINANCE:BTCUSDT", state: "armed" },
  ],
  watchlist: [{ symbol: "OANDA:XAUUSD", price: 2650 }],
  journal: {
    entries: [
      { id: "e1", symbol: "XAUUSD", side: "long", qty: 1, entryPrice: 100, exitPrice: 110, entryTime: T, exitTime: T + 60, pnl: 10 },
      { id: "e2", symbol: "EURUSD", side: "short", qty: 1, entryPrice: 1, exitPrice: 1.1, entryTime: T - 86400 * 30, exitTime: T - 86400 * 30 + 60, pnl: -5 },
    ],
    notes: [{ id: "n1", time: T, text: "calm session" }],
  },
};

let dir = "";
const saved = process.env.EZYVIEW_SNAPSHOT;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ezyview-mcp-"));
  writeFileSync(join(dir, "snap.json"), JSON.stringify(SNAPSHOT));
  process.env.EZYVIEW_SNAPSHOT = join(dir, "snap.json");
  process.env.EZYVIEW_MCP_INSECURE = "1";
});
afterAll(() => {
  if (saved === undefined) delete process.env.EZYVIEW_SNAPSHOT;
  else process.env.EZYVIEW_SNAPSHOT = saved;
  delete process.env.EZYVIEW_MCP_INSECURE;
  rmSync(dir, { recursive: true, force: true });
});

describe("workspace snapshot tools", () => {
  it("returns layouts", async () => {
    const out = await call("get_workspace");
    expect(out.data.layouts[0].charts[0].indicators).toEqual(["rsi"]);
  });

  it("filters alerts by symbol", async () => {
    const out = await call("list_alerts", { symbol: "OANDA:XAUUSD" });
    expect(out.data.alerts.map((a: { id: string }) => a.id)).toEqual(["a1"]);
    expect((await call("list_alerts")).data.alerts).toHaveLength(2);
  });

  it("returns journal entries newest first with stats", async () => {
    const out = await call("get_journal", { limit: 1 });
    expect(out.data.entries.map((e: { id: string }) => e.id)).toEqual(["e1"]);
    expect(out.data.stats.trades).toBe(2);
    expect((await call("get_journal", { symbol: "EURUSD" })).data.entries).toHaveLength(1);
  });

  it("builds a daily review pack limited to the window", async () => {
    const out = await call("journal_review_pack", { period: "daily", date: "2026-10-21" });
    expect(out.data.entries.map((e: { id: string }) => e.id)).toEqual(["e1"]);
    expect(out.data.notes).toHaveLength(1);
    expect(out.data.summary).toContain("Trades: 1");
  });

  it("survives hostile rows and clamps limit", async () => {
    const bad = { ...SNAPSHOT, alerts: [null, 5, { id: "ok", symbol: "S" }], journal: { entries: [null, { id: "x" }], notes: [] } };
    writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
    process.env.EZYVIEW_SNAPSHOT = join(dir, "bad.json");
    const alerts = await call("list_alerts", { symbol: "S" });
    const journal = await call("get_journal", { limit: -5 });
    process.env.EZYVIEW_SNAPSHOT = join(dir, "snap.json");
    expect(alerts.data.alerts).toEqual([{ id: "ok", symbol: "S" }]);
    expect(journal.data.entries).toEqual([]);
  });

  it("explains a missing snapshot instead of crashing", async () => {
    process.env.EZYVIEW_SNAPSHOT = join(dir, "missing.json");
    const out = await call("get_workspace");
    process.env.EZYVIEW_SNAPSHOT = join(dir, "snap.json");
    expect(out.isError).toBe(true);
    expect(out.text).toContain("Open the EzyView desktop app");
  });
});

describe("snapshot parsing and paths", () => {
  it("rejects non-snapshots", () => {
    expect(parseSnapshot("nope")).toBeNull();
    expect(parseSnapshot(JSON.stringify({ format: "x" }))).toBeNull();
    expect(parseSnapshot(JSON.stringify(SNAPSHOT))).not.toBeNull();
  });

  it("resolves the per-OS app data path with an env override", () => {
    expect(defaultSnapshotPath("linux", {}, "/home/u")).toBe("/home/u/.local/share/com.printezy247.ezyview/workspace-snapshot.json");
    expect(defaultSnapshotPath("darwin", {}, "/Users/u")).toBe(
      "/Users/u/Library/Application Support/com.printezy247.ezyview/workspace-snapshot.json",
    );
    expect(defaultSnapshotPath("linux", { EZYVIEW_SNAPSHOT: "/x/s.json" }, "/h")).toBe("/x/s.json");
  });
});
