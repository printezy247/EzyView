import { describe, expect, it } from "vitest";
import { rankSymbols, scoreSymbol } from "./search.js";

const SYMS = [
  { ticker: "AAPL", description: "Apple Inc." },
  { ticker: "GOOGL", description: "Alphabet Inc." },
  { ticker: "MSFT", description: "Microsoft Corp." },
  { ticker: "BTCUSDT", description: "Bitcoin / Tether" },
  { ticker: "ETHUSDT", description: "Ethereum / Tether" },
  { ticker: "ALPHA", description: "Alpha Metals" },
];

describe("scoreSymbol", () => {
  it("scores exact > prefix > substring > description", () => {
    expect(scoreSymbol("aapl", SYMS[0]!)).toBe(100); // exact
    expect(scoreSymbol("aa", SYMS[0]!)).toBe(80); // prefix
    expect(scoreSymbol("tcus", SYMS[3]!)).toBe(60); // substring in ticker BTCUSDT
    expect(scoreSymbol("apple", SYMS[0]!)).toBe(40); // description prefix
    expect(scoreSymbol("metal", SYMS[5]!)).toBe(30); // description substring
  });

  it("gives a loose subsequence a low score and rejects non-matches", () => {
    // "gol" is a subsequence of "GOOGL" (g-o-l in order) but not a substring.
    expect(scoreSymbol("gol", { ticker: "GOOGL", description: "" })).toBe(10);
    expect(scoreSymbol("zzz", SYMS[0]!)).toBe(-1);
    expect(scoreSymbol("  aapl  ", SYMS[0]!)).toBe(100); // trims
  });
});

describe("rankSymbols", () => {
  it("puts the exact match first and drops non-matches", () => {
    const ranked = rankSymbols("aapl", SYMS);
    expect(ranked[0]?.ticker).toBe("AAPL");
    expect(ranked.every((s) => s.ticker !== "MSFT")).toBe(true);
  });

  it("orders prefix before substring before subsequence", () => {
    const list = [
      { ticker: "ALPHA", description: "" }, // subsequence "aa" (a…a) → 10
      { ticker: "AAPL", description: "" }, // prefix "aa" → 80
      { ticker: "XAA", description: "" }, // substring "aa" → 60
    ];
    expect(rankSymbols("aa", list).map((s) => s.ticker)).toEqual(["AAPL", "XAA", "ALPHA"]);
  });

  it("keeps registry order for an empty query", () => {
    expect(rankSymbols("", SYMS).map((s) => s.ticker)).toEqual(SYMS.map((s) => s.ticker));
  });

  it("returns an empty list when nothing matches", () => {
    expect(rankSymbols("qqqq", SYMS)).toEqual([]);
  });
});
