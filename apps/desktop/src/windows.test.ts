import { describe, expect, it } from "vitest";
import { detachedQuery, readDetached } from "./windows";

describe("detached window params", () => {
  it("round-trips symbols that need escaping", () => {
    const q = detachedQuery("BINANCE:BTC/USDT?x", "4h");
    expect(readDetached(q)).toEqual({ symbol: "BINANCE:BTC/USDT?x", resolution: "4h" });
  });

  it("is null for the main window", () => {
    expect(readDetached("")).toBeNull();
    expect(readDetached("?res=1h")).toBeNull();
  });
});
