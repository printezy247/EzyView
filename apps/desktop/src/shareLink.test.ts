import { describe, expect, it } from "vitest";
import { buildShareLink, parseShareLink } from "./shareLink";

describe("share link", () => {
  it("builds the pinned format and round-trips", () => {
    const link = buildShareLink("https://app.example/ezyview/", { symbol: "BTCUSDT", resolution: "4h" });
    expect(link).toBe("https://app.example/ezyview/?share=BTCUSDT%3A4h");
    expect(parseShareLink(link)).toEqual({ symbol: "BTCUSDT", resolution: "4h" });
  });

  it("parses a link that also carries a hash route", () => {
    expect(parseShareLink("http://localhost:5173/?share=eurusd:1D#/chart")).toEqual({
      symbol: "EURUSD",
      resolution: "1D",
    });
  });

  it("returns null for missing, hostile or oversized input without throwing", () => {
    const bad = [
      "",
      "http://x/",
      "http://x/?share=",
      "http://x/?share=BTC",
      "http://x/?share=BTC:99x",
      "http://x/?share=BTC:1D:extra",
      "http://x/?share=%3Cscript%3E:1D",
      `http://x/?share=${"A".repeat(21)}:1D`,
      `http://x/?share=BTC:1D&pad=${"a".repeat(600)}`,
      "::not a url::",
    ];
    for (const url of bad) expect(parseShareLink(url)).toBeNull();
  });

  it("only accepts known resolutions", () => {
    expect(parseShareLink("http://x/?share=BTC:1s")).toBeNull();
    expect(parseShareLink("http://x/?share=BTC:15m")?.resolution).toBe("15m");
  });
});
