import { describe, expect, it } from "vitest";
import { DemoCalendarAdapter, DemoFundamentalsAdapter, DemoNewsAdapter } from "./demo.js";
import { heatColor, layoutHeatmap } from "./heatmap.js";
import { rowFromBars, rsiOf, runScreener } from "./screener.js";
import type { ScreenerRow } from "./screener.js";

describe("demo calendar", () => {
  it("is deterministic, sorted and respects filters", async () => {
    const cal = new DemoCalendarAdapter();
    const from = 1_700_000_000;
    const to = from + 14 * 86400;
    const a = await cal.getCalendar(from, to);
    const b = await cal.getCalendar(from, to);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
    for (let i = 1; i < a.length; i++) expect(a[i]!.time).toBeGreaterThanOrEqual(a[i - 1]!.time);
    const usd = await cal.getCalendar(from, to, { currency: "USD", impact: "high" });
    expect(usd.every((e) => e.currency === "USD" && e.impact === "high")).toBe(true);
    expect(a.every((e) => e.time >= from && e.time <= to)).toBe(true);
  });
});

describe("demo news and fundamentals", () => {
  it("tags news with the requested symbols", async () => {
    const news = await new DemoNewsAdapter().getNews({ symbols: ["BINANCE:BTCUSDT"], limit: 5 });
    expect(news).toHaveLength(5);
    expect(news.every((n) => n.symbols[0] === "BINANCE:BTCUSDT")).toBe(true);
  });

  it("leaves future earnings without actuals", async () => {
    const rows = await new DemoFundamentalsAdapter().getEarnings("NASDAQ:AAPL");
    const now = Date.now() / 1000;
    expect(rows.some((r) => r.time > now && r.eps === null)).toBe(true);
    expect(rows.filter((r) => r.time <= now).every((r) => r.eps !== null)).toBe(true);
  });
});

const row = (ticker: string, over: Partial<ScreenerRow>): ScreenerRow => ({
  symbol: `X:${ticker}`,
  ticker,
  name: ticker,
  assetClass: "stock",
  price: 100,
  changePct: 0,
  volume: 1000,
  fromHighPct: -5,
  rsi: 50,
  ...over,
});

describe("screener", () => {
  const rows = [
    row("AAA", { changePct: 5, rsi: 75 }),
    row("BBB", { changePct: -2, rsi: 25 }),
    row("CCC", { changePct: 1, rsi: null, assetClass: "crypto" }),
  ];
  const base = { filters: [], sortBy: "changePct" as const, descending: true };

  it("filters by range and drops nulls on a bounded field", () => {
    const out = runScreener(rows, { ...base, filters: [{ field: "rsi", min: 70 }] });
    expect(out.map((r) => r.ticker)).toEqual(["AAA"]);
  });

  it("sorts with nulls last and filters by class/text", () => {
    expect(runScreener(rows, { ...base, sortBy: "rsi" }).map((r) => r.ticker)).toEqual(["AAA", "BBB", "CCC"]);
    expect(runScreener(rows, { ...base, assetClass: "crypto" }).map((r) => r.ticker)).toEqual(["CCC"]);
    expect(runScreener(rows, { ...base, text: "bb" }).map((r) => r.ticker)).toEqual(["BBB"]);
  });

  it("computes RSI extremes and builds rows from bars", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsiOf(up)).toBe(100);
    expect(rsiOf([1, 2, 3])).toBeNull();
    const built = rowFromBars({ symbol: "X:A", ticker: "A", name: "A", assetClass: "stock" }, up.map((c) => ({ high: c + 1, close: c, volume: 10 })));
    expect(built?.changePct).toBeCloseTo(29, 5);
    expect(built?.fromHighPct).toBeLessThan(0);
    expect(rowFromBars({ symbol: "X:A", ticker: "A", name: "A", assetClass: "stock" }, [])).toBeNull();
  });
});

describe("heatmap", () => {
  it("fills the rectangle with area proportional to weight", () => {
    const items = [10, 6, 6, 4, 3, 2, 1].map((weight, i) => ({ id: `${i}`, label: `${i}`, weight, changePct: i - 3 }));
    const tiles = layoutHeatmap(items, 400, 300);
    expect(tiles).toHaveLength(items.length);
    const total = tiles.reduce((s, t) => s + t.w * t.h, 0);
    expect(total).toBeCloseTo(400 * 300, 3);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(400 + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(300 + 1e-6);
      const w = items.find((i) => i.id === t.id)!.weight;
      expect((t.w * t.h) / (400 * 300)).toBeCloseTo(w / 32, 5);
    }
  });

  it("handles empty input and colors by sign", () => {
    expect(layoutHeatmap([], 10, 10)).toEqual([]);
    expect(heatColor(10)).toBe("rgb(38, 166, 154)");
    expect(heatColor(-10)).toBe("rgb(239, 83, 80)");
    expect(heatColor(0)).toBe("rgb(42, 46, 57)");
  });
});
