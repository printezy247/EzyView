import { describe, expect, it } from "vitest";
import { filterSymbols, parseCommand, TIMEFRAMES } from "./ChartCommandInput";

describe("parseCommand", () => {
  it("returns null for non-slash input", () => {
    expect(parseCommand("AAPL")).toBeNull();
    expect(parseCommand("  ")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
  it("parses a command with no args", () => {
    expect(parseCommand("/layout")).toEqual({ name: "layout", args: "" });
  });
  it("parses a command with args", () => {
    expect(parseCommand("/tf 1h")).toEqual({ name: "tf", args: "1h" });
    expect(parseCommand("  /sym aapl  ")).toEqual({ name: "sym", args: "aapl" });
  });
});

describe("filterSymbols", () => {
  it("returns all when query empty", () => {
    expect(filterSymbols(["AAPL", "MSFT"], "")).toEqual(["AAPL", "MSFT"]);
    expect(filterSymbols(["AAPL", "MSFT"], "   ")).toEqual(["AAPL", "MSFT"]);
  });
  it("filters case-insensitively", () => {
    expect(filterSymbols(["AAPL", "MSFT", "amzn"], "a")).toEqual(["AAPL", "amzn"]);
  });
});

describe("TIMEFRAMES", () => {
  it("contains the canonical list", () => {
    expect(TIMEFRAMES).toContain("1m");
    expect(TIMEFRAMES).toContain("1M");
  });
});