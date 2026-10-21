import { describe, expect, it } from "vitest";
import type { EconomicEvent, EarningsReport, NewsItem } from "@ezyview/data-adapters";
import { filterEvents, filterNews, fundamentalOverlays } from "./overlay.js";

const T0 = 1_700_000_000;

const event = (over: Partial<EconomicEvent> & Pick<EconomicEvent, "title">): EconomicEvent => ({
  id: `ev-${over.title}`,
  time: T0,
  currency: "USD",
  impact: "high",
  source: "demo",
  ...over,
});

const news = (over: Partial<NewsItem> & Pick<NewsItem, "headline">): NewsItem => ({
  id: `n-${over.headline}`,
  time: T0,
  source: "demo",
  symbols: [],
  ...over,
});

const earning = (over: Partial<EarningsReport> & Pick<EarningsReport, "symbol">): EarningsReport => ({
  time: T0,
  quarter: "Q1",
  source: "demo",
  ...over,
});

describe("filterEvents", () => {
  const events = [
    event({ id: "a", title: "NFP", impact: "high", currency: "USD", time: T0 + 100 }),
    event({ id: "b", title: "CPI y/y", impact: "medium", currency: "USD", time: T0 + 200 }),
    event({ id: "c", title: "GDP", impact: "high", currency: "EUR", time: T0 + 300 }),
    event({ id: "d", title: "FOMC Minutes", impact: "low", currency: "USD", time: T0 + 400 }),
  ];

  it("ANDs impact, currency, search and range filters", () => {
    const out = filterEvents(events, { impact: "high", currency: "usd", search: "nfp", from: T0, to: T0 + 500 });
    expect(out.map((e) => e.id)).toEqual(["a"]);

    expect(filterEvents(events, { impact: "medium", currency: "EUR" })).toEqual([]);
    expect(filterEvents(events, { currency: "eur", from: T0 + 250 }).map((e) => e.id)).toEqual(["c"]);
  });

  it("treats from as inclusive and to as exclusive", () => {
    expect(filterEvents(events, { from: T0 + 100, to: T0 + 300 }).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("skips impact filtering when omitted or 'all' and matches search case-insensitively", () => {
    expect(filterEvents(events, {})).toHaveLength(events.length);
    expect(filterEvents(events, { impact: "all" })).toHaveLength(events.length);
    expect(filterEvents(events, { search: "nfp" }).map((e) => e.id)).toEqual(["a"]);
    expect(filterEvents(events, { search: "USD" }).map((e) => e.id)).toEqual(["a", "b", "d"]);
  });

  it("does not mutate the input array", () => {
    const snapshot = structuredClone(events);
    filterEvents(events, { impact: "high", search: "a" });
    expect(events).toEqual(snapshot);
  });
});

describe("filterNews", () => {
  const items = [
    news({ id: "1", headline: "Fed holds rates", summary: "Committee keeps range unchanged" }),
    news({ id: "2", headline: "Apple beats estimates", summary: "iPhone revenue tops forecasts" }),
  ];

  it("matches case-insensitively over headline and summary", () => {
    expect(filterNews(items, "FED").map((n) => n.id)).toEqual(["1"]);
    expect(filterNews(items, "iphone").map((n) => n.id)).toEqual(["2"]);
    expect(filterNews(items, "rates").map((n) => n.id)).toEqual(["1"]);
    expect(filterNews(items, "revenue").map((n) => n.id)).toEqual(["2"]);
  });

  it("returns the input as-is for empty or whitespace search", () => {
    expect(filterNews(items, "")).toEqual(items);
    expect(filterNews(items, "   ")).toEqual(items);
  });
});

describe("fundamentalOverlays", () => {
  it("maps earnings-only inputs to earnings markers", () => {
    const earnings = [
      earning({ symbol: "NASDAQ:AAPL", time: T0 + 200 }),
      earning({ symbol: "NASDAQ:MSFT", time: T0 + 100 }),
    ];
    const out = fundamentalOverlays(earnings, [], {});
    expect(out.markers).toEqual([
      { time: T0 + 100, title: "NASDAQ:MSFT", kind: "earnings" },
      { time: T0 + 200, title: "NASDAQ:AAPL", kind: "earnings" },
    ]);
    expect(out.lines).toEqual([]);
  });

  it("excludes events below minImpact (default high)", () => {
    const events = [
      event({ id: "a", title: "NFP", impact: "high", time: T0 + 300 }),
      event({ id: "b", title: "CPI", impact: "medium", time: T0 + 100 }),
      event({ id: "c", title: "PPI", impact: "low", time: T0 + 200 }),
    ];
    const out = fundamentalOverlays([], events, {});
    expect(out.markers).toEqual([{ time: T0 + 300, title: "NFP", kind: "event", impact: "high" }]);
    expect(out.lines).toEqual([T0 + 300]);

    const lowered = fundamentalOverlays([], events, { minImpact: "low" });
    expect(lowered.markers.map((m) => m.time)).toEqual([T0 + 100, T0 + 200, T0 + 300]);
    expect(lowered.lines).toEqual([T0 + 100, T0 + 200, T0 + 300]);
  });

  it("honours an exact impact set, overriding minImpact", () => {
    const events = [
      event({ title: "NFP", impact: "high", time: T0 + 1 }),
      event({ title: "CPI", impact: "medium", time: T0 + 2 }),
      event({ title: "Minutes", impact: "low", time: T0 + 3 }),
    ];
    const out = fundamentalOverlays([], events, { impacts: ["medium", "low"] });
    expect(out.markers.map((m) => m.title)).toEqual(["CPI", "Minutes"]);
    expect(out.lines).toEqual([T0 + 2, T0 + 3]);
    expect(fundamentalOverlays([], events, { impacts: [] })).toEqual({ markers: [], lines: [] });
  });

  it("can turn earnings or economic events off independently", () => {
    const earnings = [earning({ symbol: "AAPL", time: T0 })];
    const events = [event({ title: "NFP", time: T0 + 1 })];
    const noEarnings = fundamentalOverlays(earnings, events, { showEarnings: false });
    expect(noEarnings.markers.map((m) => m.kind)).toEqual(["event"]);
    const noEvents = fundamentalOverlays(earnings, events, { showEvents: false });
    expect(noEvents.markers.map((m) => m.kind)).toEqual(["earnings"]);
    expect(noEvents.lines).toEqual([]);
  });

  it("drops earnings rows without a finite time", () => {
    const earnings = [
      earning({ symbol: "NASDAQ:AAPL", time: Number.NaN }),
      earning({ symbol: "NASDAQ:MSFT", time: T0 }),
    ];
    expect(fundamentalOverlays(earnings, [], {}).markers.map((m) => m.title)).toEqual(["NASDAQ:MSFT"]);
  });

  it("dedupes markers by (time, title) and sorts lines ascending with unique times", () => {
    const earnings = [earning({ symbol: "NASDAQ:AAPL", time: T0 + 400 })];
    const events = [
      event({ id: "a", title: "NFP", impact: "high", time: T0 + 400 }),
      event({ id: "b", title: "NFP", impact: "high", time: T0 + 400 }),
      event({ id: "c", title: "CPI", impact: "high", time: T0 + 100 }),
      event({ id: "d", title: "GDP", impact: "high", time: T0 + 200 }),
      event({ id: "e", title: "GDP", impact: "high", time: T0 + 200 }),
    ];
    const out = fundamentalOverlays(earnings, events, {});
    expect(out.markers).toEqual([
      { time: T0 + 100, title: "CPI", kind: "event", impact: "high" },
      { time: T0 + 200, title: "GDP", kind: "event", impact: "high" },
      { time: T0 + 400, title: "NASDAQ:AAPL", kind: "earnings" },
      { time: T0 + 400, title: "NFP", kind: "event", impact: "high" },
    ]);
    expect(out.lines).toEqual([T0 + 100, T0 + 200, T0 + 400]);
  });

  it("does not mutate the input arrays", () => {
    const earnings = [earning({ symbol: "NASDAQ:AAPL", time: T0 })];
    const events = [event({ id: "a", title: "NFP", impact: "medium", time: T0 + 1 })];
    const eSnapshot = structuredClone(earnings);
    const vSnapshot = structuredClone(events);
    fundamentalOverlays(earnings, events, { minImpact: "high", now: T0 });
    expect(earnings).toEqual(eSnapshot);
    expect(events).toEqual(vSnapshot);
  });
});
