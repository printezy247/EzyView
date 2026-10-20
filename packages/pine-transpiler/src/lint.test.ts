import { describe, expect, it } from "vitest";
import { lintPine } from "./lint.js";

const EMPTY_ERROR = { line: 1, column: 1, message: "Empty script", severity: "error" } as const;

describe("lintPine", () => {
  it("flags an empty script and reports nothing else", () => {
    expect(lintPine("")).toEqual([EMPTY_ERROR]);
    expect(lintPine("   \n\t\n ")).toEqual([EMPTY_ERROR]);
  });

  it("warns when //@version= is missing", () => {
    expect(lintPine('indicator("T")\nplot(close)')).toEqual([
      { line: 1, column: 1, message: "Missing //@version= comment", severity: "warning" },
    ]);
  });

  it("stays quiet about the version when one is present", () => {
    expect(lintPine('//@version=5\nindicator("T")\nplot(close)')).toEqual([]);
  });

  it("errors when both indicator() and strategy() are declared, at the second occurrence's line", () => {
    const src = ['//@version=5', 'indicator("T")', "x = 1", 'strategy("S")', "plot(close)"].join("\n");
    expect(lintPine(src)).toEqual([
      { line: 4, column: 1, message: "Script declares both indicator() and strategy()", severity: "error" },
    ]);
  });

  it("points at whichever declaration comes second, in source order", () => {
    const src = [
      '//@version=5',
      'strategy("S")',
      'strategy.entry("L", strategy.long)',
      'indicator("T")',
      "plot(close)",
    ].join("\n");
    expect(lintPine(src)).toEqual([
      { line: 4, column: 1, message: "Script declares both indicator() and strategy()", severity: "error" },
    ]);
  });

  it("warns when there is no plot or strategy call", () => {
    expect(lintPine('//@version=5\nindicator("T")\nx = close')).toEqual([
      { line: 1, column: 1, message: "Script has no plot or strategy call", severity: "warning" },
    ]);
  });

  it("accepts a strategy order call as satisfying the plot warning", () => {
    const src = ['//@version=5', 'strategy("S")', 'strategy.entry("L", strategy.long)'].join("\n");
    expect(lintPine(src)).toEqual([]);
  });

  it("ignores plot( and strategy( mentions inside line comments", () => {
    const src = [
      '//@version=5',
      'indicator("T")',
      "// plot(close) and strategy.entry were considered",
      "x = close",
    ].join("\n");
    expect(lintPine(src)).toEqual([
      { line: 1, column: 1, message: "Script has no plot or strategy call", severity: "warning" },
    ]);
  });

  it("ignores declarations mentioned only in comments", () => {
    const src = ['//@version=5', 'indicator("T")', '// strategy("S") was considered', "plot(close)"].join("\n");
    expect(lintPine(src)).toEqual([]);
  });

  it("does not treat bgcolor() as a plot call", () => {
    const src = '//@version=5\nindicator("T")\nbgcolor(close > open)';
    expect(lintPine(src)).toEqual([
      { line: 1, column: 1, message: "Script has no plot or strategy call", severity: "warning" },
    ]);
  });

  it("reports issues in rule order", () => {
    const src = ['indicator("T")', 'strategy("S")', "x = close"].join("\n");
    expect(lintPine(src).map((i) => i.message)).toEqual([
      "Missing //@version= comment",
      "Script declares both indicator() and strategy()",
      "Script has no plot or strategy call",
    ]);
  });
});
