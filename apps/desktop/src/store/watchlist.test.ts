import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "../store";
import { watchRowActive } from "./watchlist";
import type { WatchEntry } from "./types";

const row = (over: Partial<WatchEntry> = {}): WatchEntry => ({
  symbol: "OANDA:XAUUSD",
  ticker: "XAUUSD",
  description: "Gold",
  assetClass: "Commodity",
  precision: 2,
  price: 100,
  changePct: 1.5,
  ...over,
});

describe("updateWatchPrice", () => {
  beforeEach(() => useWorkspace.setState({ watchlist: [row()] }));

  it("keeps the last change% when a quote omits it", () => {
    useWorkspace.getState().updateWatchPrice("OANDA:XAUUSD", 101, null);
    const r = useWorkspace.getState().watchlist[0]!;
    expect(r.price).toBe(101);
    expect(r.changePct).toBe(1.5);
  });

  it("takes a new change% when one is given", () => {
    useWorkspace.getState().updateWatchPrice("OANDA:XAUUSD", 102, -0.4);
    expect(useWorkspace.getState().watchlist[0]!.changePct).toBe(-0.4);
  });
});

describe("watchRowActive", () => {
  it("needs the same symbol and the same resolved feed", () => {
    expect(watchRowActive(row({ source: "mt5" }), "OANDA:XAUUSD", "mt5", "ezyview")).toBe(true);
    expect(watchRowActive(row({ source: "mt5" }), "OANDA:XAUUSD", "demo", "ezyview")).toBe(false);
    expect(watchRowActive(row({ source: "mt5" }), "OANDA:EURUSD", "mt5", "ezyview")).toBe(false);
  });

  it("a row without a source follows the global feed", () => {
    expect(watchRowActive(row(), "OANDA:XAUUSD", "demo", "ezyview")).toBe(true);
    expect(watchRowActive(row(), "OANDA:XAUUSD", "mt5", "mt5")).toBe(true);
    expect(watchRowActive(row(), "OANDA:XAUUSD", "mt5", "ezyview")).toBe(false);
  });
});

describe("removeFromWatchlist", () => {
  it("removes the row", () => {
    useWorkspace.setState({ watchlist: [row()] });
    useWorkspace.getState().removeFromWatchlist("OANDA:XAUUSD");
    expect(useWorkspace.getState().watchlist).toHaveLength(0);
  });
});

describe("invalidateFollowGlobalPrices", () => {
  it("blanks rows that follow the global feed and keeps pinned rows", () => {
    useWorkspace.setState({
      watchlist: [row(), row({ symbol: "BINANCE:BTCUSDT", ticker: "BTCUSDT", source: "binance" })],
    });
    useWorkspace.getState().invalidateFollowGlobalPrices();
    const [follow, pinned] = useWorkspace.getState().watchlist;
    expect(follow!.price).toBeNull();
    expect(follow!.changePct).toBeNull();
    expect(pinned!.price).toBe(100);
    expect(pinned!.changePct).toBe(1.5);
  });
});

describe("setReplay", () => {
  it("records the focused chart's symbol and clears it when replay ends", () => {
    const s = useWorkspace.getState();
    const symbol = s.activeChart().symbol;
    s.setReplay(10);
    expect(useWorkspace.getState().replayBar).toBe(10);
    expect(useWorkspace.getState().replaySymbol).toBe(symbol);
    s.setReplay(null);
    expect(useWorkspace.getState().replayBar).toBeNull();
    expect(useWorkspace.getState().replaySymbol).toBeNull();
  });
});
