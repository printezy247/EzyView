import { describe, expect, it } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import { getActiveExportSource, registerExportSource, setActiveExportSource } from "./exportBridge";
import type { ExportSource } from "./exportBridge";

const BAR: Candle = { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 };

const source = (symbol: string, png: string | null = "data:image/png;base64,x"): ExportSource => ({
  getPng: () => png,
  getCandles: () => [BAR],
  meta: () => ({ symbol, resolution: "1D" }),
});

describe("exportBridge", () => {
  it("is null-safe in node with nothing registered", () => {
    expect(getActiveExportSource()).toBeNull();
  });

  it("returns the active source only while it is registered", () => {
    const off = registerExportSource(0, source("BTCUSDT"));
    setActiveExportSource(0);
    const active = getActiveExportSource();
    expect(active?.meta()).toEqual({ symbol: "BTCUSDT", resolution: "1D" });
    expect(active?.getPng()).toBe("data:image/png;base64,x");
    expect(active?.getCandles()).toEqual([BAR]);
    off();
    expect(getActiveExportSource()).toBeNull(); // unregister clears the active id
    setActiveExportSource(null);
  });

  it("ignores an active id that was never registered", () => {
    setActiveExportSource(7);
    expect(getActiveExportSource()).toBeNull();
    setActiveExportSource(null);
  });

  it("keeps the active id when an unrelated source unregisters", () => {
    const offA = registerExportSource(0, source("A"));
    const offB = registerExportSource(1, source("B"));
    setActiveExportSource(1);
    offA();
    expect(getActiveExportSource()?.meta().symbol).toBe("B");
    offB();
    expect(getActiveExportSource()).toBeNull();
    setActiveExportSource(null);
  });
});
