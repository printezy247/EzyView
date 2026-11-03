import { describe, expect, it } from "vitest";

import { DELAY_AFTER_SECONDS, STALE_AFTER_SECONDS, provenanceOf, provenanceLabel, provenanceTone } from "./provenance";

/**
 * Where a price came from, stated on the quote itself.
 *
 * The app has two feeds: the built-in demo adapter and a broker bridge. The
 * distinction the user actually needs is "can I trust this price to act on?",
 * so the four states are about that, not about internals.
 */

describe("provenanceOf", () => {
  it("calls the built-in feed demo, whatever the connection is doing", () => {
    expect(provenanceOf({ source: "ezyview", status: "online" })).toBe("demo");
    expect(provenanceOf({ source: "ezyview", status: "error" })).toBe("demo");
  });

  it("calls a connected bridge live", () => {
    expect(provenanceOf({ source: "mt5", status: "online" })).toBe("live");
  });

  it("calls a bridge that is still connecting delayed", () => {
    expect(provenanceOf({ source: "mt5", status: "connecting" })).toBe("delayed");
  });

  it("calls a bridge that has dropped cached, because the price is the last one seen", () => {
    expect(provenanceOf({ source: "mt5", status: "error" })).toBe("cached");
  });

  it("calls an idle bridge cached, because nothing is arriving", () => {
    expect(provenanceOf({ source: "mt5", status: "idle" })).toBe("cached");
  });

  it("downgrades a live feed to delayed once the quote goes stale", () => {
    expect(provenanceOf({ source: "mt5", status: "online", ageSeconds: DELAY_AFTER_SECONDS - 1 })).toBe("live");
    expect(provenanceOf({ source: "mt5", status: "online", ageSeconds: DELAY_AFTER_SECONDS + 1 })).toBe("delayed");
  });

  it("calls a feed with no tick for a minute stale, not merely delayed", () => {
    expect(provenanceOf({ source: "mt5", status: "online", ageSeconds: STALE_AFTER_SECONDS + 1 })).toBe("stale");
  });

  it("does not downgrade a cached feed any further", () => {
    expect(provenanceOf({ source: "mt5", status: "error", ageSeconds: 100_000 })).toBe("cached");
  });

  it("ignores the age of the demo feed's own quotes", () => {
    expect(provenanceOf({ source: "ezyview", status: "online", ageSeconds: 100_000 })).toBe("demo");
  });

  it("calls a feed that reported a failure cached, even while the bridge is up", () => {
    // The provider answered with an error: the price on screen is the last one
    // that arrived, whatever the bridge's own connection state says.
    expect(provenanceOf({ source: "mt5", status: "online", feedFailed: true })).toBe("cached");
  });

  it("calls a failed live source cached and keeps the demo feed demo", () => {
    expect(provenanceOf({ source: "ezyview", status: "online", feedFailed: true })).toBe("demo");
  });
});

describe("provenanceLabel", () => {
  it("names each state in a way that fits on a chip", () => {
    expect(provenanceLabel("live")).toBe("LIVE");
    expect(provenanceLabel("delayed")).toBe("DELAYED");
    expect(provenanceLabel("demo")).toBe("DEMO");
    expect(provenanceLabel("cached")).toBe("CACHED");
    expect(provenanceLabel("stale")).toBe("STALE");
  });
});

describe("provenanceTone", () => {
  it("gives live a positive tone and the rest a neutral or warning one", () => {
    expect(provenanceTone("live")).toBe("up");
    expect(provenanceTone("delayed")).toBe("warn");
    expect(provenanceTone("cached")).toBe("warn");
    expect(provenanceTone("stale")).toBe("warn");
    expect(provenanceTone("demo")).toBe("neutral");
  });
});
