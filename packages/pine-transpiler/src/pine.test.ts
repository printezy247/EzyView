import { describe, expect, it } from "vitest";
import { lex } from "./lexer.js";
import { parse, PineSyntaxError } from "./parser.js";
import { transpile, PineUnsupportedError } from "./transpile.js";
import { runPine } from "./evaluate.js";
import { color } from "./runtime.js";
import type { Context, PineValue } from "./runtime.js";

/** 30 bars of a steady uptrend so indicators have something to chew on. */
function makeContext(n = 30): Context {
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  const volume: number[] = [];
  for (let i = 0; i < n; i++) {
    const base = 100 + i;
    open.push(base);
    close.push(base + 0.5);
    high.push(base + 1);
    low.push(base - 1);
    volume.push(1000 + i);
  }
  return { open, high, low, close, volume, barIndex: n - 1, inputs: {} };
}

const values = (v: PineValue[]): (number | undefined)[] =>
  v.map((x) => (typeof x === "number" ? x : undefined));

/** SMA of close over a fresh uptrend context, with `seed` under positional key "0". */
const smaWithSeededLength = (seed: number): (number | undefined)[] => {
  const ctx = makeContext(12);
  ctx.inputs["0"] = seed;
  const out = runPine("plot(ta.sma(close, input.int(3)))", ctx);
  return values(out.plots[0]!.values);
};

describe("lexer", () => {
  it("emits newline tokens, which Pine uses as statement separators", () => {
    const tokens = lex("a = 1\nb = 2");
    expect(tokens.filter((t) => t.type === "newline")).toHaveLength(1);
  });

  it("prefers multi-character operators over single ones", () => {
    const ops = lex("a := b >= c && d != e").filter((t) => t.type === "op").map((t) => t.value);
    expect(ops).toEqual([":=", ">=", "&&", "!="]);
  });

  it("skips line comments including the version directive", () => {
    const tokens = lex("//@version=6\nplot(close)");
    // Newlines are significant (they separate statements), so the directive's
    // trailing newline still emits — but the comment text itself must not.
    const idents = tokens.filter((t) => t.type === "ident").map((t) => t.value);
    expect(idents).toEqual(["plot", "close"]);
    expect(tokens.some((t) => t.value.includes("version"))).toBe(false);
  });

  it("lexes strings with escapes", () => {
    const t = lex('"hello\\nworld"')[0]!;
    expect(t.literal).toBe("hello\nworld");
  });

  it("tracks line numbers", () => {
    expect(lex("a\nb\nc").filter((t) => t.type === "ident").map((t) => t.line)).toEqual([1, 2, 3]);
  });
});

describe("parser", () => {
  it("parses a leading indicator call", () => {
    const script = parse('indicator("My Script", overlay=true)\nplot(close)');
    expect(script.declaration?.callee).toMatchObject({ kind: "Identifier", name: "indicator" });
    expect(script.body).toHaveLength(1);
  });

  it("treats `==` as a comparison, not a declaration", () => {
    const script = parse("bool x = close == open");
    expect(script.body[0]?.kind).toBe("VarDecl");
  });

  it("parses := as reassignment", () => {
    const script = parse("x = 1\nx := x + 1");
    expect(script.body[1]?.kind).toBe("AssignExpr");
  });

  it("parses if/else", () => {
    const script = parse("if close > open\n  x = 1\nelse\n  x = 2");
    const stmt = script.body[0]!;
    expect(stmt.kind).toBe("IfStmt");
    if (stmt.kind === "IfStmt") expect(stmt.alternate).not.toBeNull();
  });

  it("parses for loops with `to` and `by`", () => {
    const script = parse("for i = 0 to 9 by 2\n  x = i");
    const stmt = script.body[0]!;
    expect(stmt.kind).toBe("ForStmt");
  });

  it("reports a located syntax error", () => {
    expect(() => parse("a = ")).toThrow(PineSyntaxError);
    try {
      parse("a = ");
    } catch (e) {
      expect((e as PineSyntaxError).line).toBeGreaterThan(0);
    }
  });

  it("handles bracketed blocks", () => {
    const script = parse("if close > open {\n  x = 1\n  y = 2\n}");
    const stmt = script.body[0]!;
    if (stmt.kind !== "IfStmt") throw new Error("expected IfStmt");
    expect(stmt.consequent.body).toHaveLength(2);
  });
});

describe("transpile", () => {
  it("extracts the script title and overlay flag", () => {
    const { options } = transpile('indicator("Cross", shorttitle="X", overlay=false)');
    expect(options.title).toBe("Cross");
    expect(options.shortName).toBe("X");
    expect(options.overlay).toBe(false);
  });

  it("flags strategies", () => {
    const { options } = transpile('strategy("Test")');
    expect(options.isStrategy).toBe(true);
  });

  it("emits a per-bar loop", () => {
    const { code } = transpile("plot(close)");
    expect(code).toContain("for (let barIndex");
  });

  it("hoists var declarations out of the bar loop", () => {
    const { code } = transpile("var float total = 0\ntotal := total + 1");
    expect(code).toContain("let total = 0;");
    expect(code.indexOf("let total = 0;")).toBeLessThan(code.indexOf("for (let barIndex"));
  });
});

describe("evaluate", () => {
  it("plots the close series", () => {
    const ctx = makeContext(5);
    const out = runPine('indicator("T")\nplot(close, "Close")', ctx);
    expect(out.plots).toHaveLength(1);
    expect(out.plots[0]?.title).toBe("Close");
    expect(values(out.plots[0]!.values)).toEqual([100.5, 101.5, 102.5, 103.5, 104.5]);
  });

  it("broadcasts arithmetic and keeps the series shape", () => {
    const ctx = makeContext(4);
    const out = runPine('plot(close * 2)', ctx);
    expect(values(out.plots[0]!.values)).toEqual([201, 203, 205, 207]);
  });

  it("applies series offsets with `[]`", () => {
    const ctx = makeContext(4);
    const out = runPine("plot(close[1])", ctx);
    const vals = values(out.plots[0]!.values);
    expect(vals[0]).toBeUndefined(); // na on the first bar
    expect(vals[1]).toBe(100.5);
    expect(vals[3]).toBe(102.5);
  });

  it("computes ta.sma matching the indicators package", () => {
    const ctx = makeContext(10);
    const out = runPine("plot(ta.sma(close, 3))", ctx);
    const vals = values(out.plots[0]!.values);
    expect(vals[0]).toBeUndefined();
    expect(vals[1]).toBeUndefined();
    expect(vals[2]).toBeCloseTo((100.5 + 101.5 + 102.5) / 3, 6);
    expect(vals[9]).toBeCloseTo((107.5 + 108.5 + 109.5) / 3, 6);
  });

  it("computes ta.rsi bounded to 0..100", () => {
    const ctx = makeContext(20);
    const out = runPine("plot(ta.rsi(close, 14))", ctx);
    for (const v of out.plots[0]!.values) {
      if (typeof v !== "number") continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // On a steady uptrend RSI pins at 100.
    expect(values(out.plots[0]!.values).at(-1)).toBeCloseTo(100, 6);
  });

  it("detects crossovers", () => {
    // A series that dips then rises across a flat line.
    const ctx: Context = {
      open: Array.from({ length: 10 }, () => 1),
      high: Array.from({ length: 10 }, () => 2),
      low: Array.from({ length: 10 }, () => 0),
      close: [5, 4, 3, 2, 1, 2, 3, 4, 5, 6],
      volume: Array.from({ length: 10 }, () => 1),
      barIndex: 9,
      inputs: {},
    };
    const out = runPine("plot(ta.crossover(close, 2) ? 1 : 0)", ctx);
    const vals = values(out.plots[0]!.values);
    // Bar 5's close is exactly 2, and crossover requires strictly above, so the
    // cross-up through 2 lands on bar 6 (prev 2 <= 2, cur 3 > 2).
    expect(vals[6]).toBe(1);
    expect(vals[5]).toBe(0);
    expect(vals[4]).toBe(0);
  });

  it("runs if/else over bars", () => {
    const ctx = makeContext(6);
    const out = runPine(
      `x = 0
       if close > open
         x := 1
       else
         x := 0
       plot(x)`,
      ctx,
    );
    expect(values(out.plots[0]!.values)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("accumulates across bars with `var`", () => {
    const ctx = makeContext(5);
    const out = runPine(
      `var float count = 0
       count := count + 1
       plot(count)`,
      ctx,
    );
    expect(values(out.plots[0]!.values)).toEqual([1, 2, 3, 4, 5]);
  });

  it("resets non-var variables each bar", () => {
    const ctx = makeContext(3);
    const out = runPine(
      `float count = 0
       count := count + 1
       plot(count)`,
      ctx,
    );
    expect(values(out.plots[0]!.values)).toEqual([1, 1, 1]);
  });

  it("runs for loops", () => {
    const ctx = makeContext(1);
    const out = runPine(
      `float total = 0
       for i = 1 to 4
         total := total + i
       plot(total)`,
      ctx,
    );
    expect(values(out.plots[0]!.values)).toEqual([10]);
  });

  it("reads inputs", () => {
    const ctx = makeContext(6);
    ctx.inputs["0"] = 5;
    const out = runPine("plot(ta.sma(close, input.int(3)))", ctx);
    // Seeded length 5: the SMA warms up over the first four bars, so index 2
    // stays na (the default of 3 would have resolved there) and index 4 is
    // the mean of the first five closes.
    const vals = values(out.plots[0]!.values);
    expect(vals[2]).toBeUndefined();
    expect(vals[4]).toBeCloseTo(102.5);
  });

  it("keys positional inputs by call site — one key per site after a run", () => {
    const ctx = makeContext(6);
    runPine('plot(input.int(3))\nplot(input.int(7, title="Second"))', ctx);
    // One key per input call site in source order, never one per bar.
    expect(Object.keys(ctx.inputs).sort()).toEqual(["0", "1"]);
    expect(ctx.inputs["0"]).toBe(3);
    expect(ctx.inputs["1"]).toBe(7);
  });

  it("lets a seeded positional input change results", () => {
    expect(smaWithSeededLength(5)).not.toEqual(smaWithSeededLength(9));
  });

  it("still keys an input by id= when given", () => {
    const ctx = makeContext(3);
    ctx.inputs["len"] = 2;
    const out = runPine('plot(ta.sma(close, input.int(3, id="len")))', ctx);
    // Seeded length 2 resolves one bar earlier than the default 3 would.
    const vals = values(out.plots[0]!.values);
    expect(vals[1]).toBeDefined();
    expect(vals[1]).toBeCloseTo(101);
  });

  it("propagates na through arithmetic", () => {
    const ctx = makeContext(3);
    const out = runPine("plot(nz(close[5]) + 1)", ctx);
    expect(values(out.plots[0]!.values)).toEqual([1, 1, 1]);
  });

  it("records strategy orders", () => {
    // A dip below the SMA followed by a rally, so the crossover actually fires.
    // A steady uptrend never crosses up through its own average.
    const ctx: Context = {
      open: [100, 99, 98, 97, 96, 97, 99, 101, 103, 105],
      high: [101, 100, 99, 98, 97, 99, 101, 103, 105, 107],
      low: [99, 98, 97, 96, 95, 96, 98, 100, 102, 104],
      close: [100, 98, 97, 96, 98, 100, 102, 104, 106, 108],
      volume: Array.from({ length: 10 }, () => 1000),
      barIndex: 9,
      inputs: {},
    };
    const out = runPine(
      `strategy("S")
       longCondition = ta.crossover(close, ta.sma(close, 3))
       if longCondition
         strategy.entry("Long", strategy.long)`,
      ctx,
    );
    expect(out.options.isStrategy).toBe(true);
    expect(out.orders.length).toBeGreaterThan(0);
    expect(out.orders[0]?.side).toBe("long");
    expect(out.orders[0]?.action).toBe("entry");
  });

  it("exposes math.* helpers", () => {
    const ctx = makeContext(3);
    const out = runPine("plot(math.max(close[1], 1000))", ctx);
    // `close[1]` is na on the first bar, and Pine propagates na through
    // math.max, so only the bars that have a previous close resolve to 1000.
    expect(values(out.plots[0]!.values)).toEqual([undefined, 1000, 1000]);
  });

  it("supports plotshape as a marker series", () => {
    const ctx = makeContext(5);
    const out = runPine('plotshape(close > 101, "up", shape.triangleup, location.belowbar, color.green)', ctx);
    const vals = values(out.plots[0]!.values);
    expect(vals[0]).toBeUndefined();
    expect(vals[2]).toBeDefined();
  });
});

describe("keyword arguments", () => {
  it("reads plot options by name instead of by position", () => {
    const out = runPine('plot(close, "C", color=color.red, linewidth=3)', makeContext(3));
    expect(out.plots[0]?.title).toBe("C");
    expect(out.plots[0]?.color).toBe("#ef5350");
    expect(out.plots[0]?.linewidth).toBe(3);
  });

  it("applies style from a keyword and leaves unsupplied options alone", () => {
    const out = runPine('plot(close, color=color.blue, style="histogram")', makeContext(3));
    expect(out.plots[0]?.color).toBe("#2962ff");
    expect(out.plots[0]?.style).toBe("histogram");
    expect(out.plots[0]?.linewidth).toBe(2);
    expect(out.plots[0]?.title).toBe("Plot 1");
  });

  it("takes bgcolor's color keyword", () => {
    const out = runPine("bgcolor(close > 100, color=color.green)", makeContext(3));
    expect(out.plots[0]?.title).toBe("BG 1");
    expect(out.plots[0]?.color).toBe("#26a69a");
    expect(out.plots[0]?.linewidth).toBe(0);
  });

  it("takes input defaults written as keywords", () => {
    const out = runPine("plot(input.int(defval=20, title=\"Len\"))", makeContext(3));
    expect(values(out.plots[0]!.values)).toEqual([20, 20, 20]);
  });

  it("takes strategy.entry id and direction written as keywords", () => {
    const ctx = makeContext(5);
    const out = runPine(
      `strategy("S")
       longCondition = close > 100
       if longCondition
         strategy.entry(id="Long", direction=strategy.long)`,
      ctx,
    );
    expect(out.orders[0]?.id).toBe("Long");
    expect(out.orders[0]?.side).toBe("long");
  });
});

describe("color.new", () => {
  it("reads its second argument as transparency, not opacity", () => {
    expect(color.new("#2962ff", 0)).toBe("rgba(41, 98, 255, 1.000)");
    expect(color.new("#2962ff", 90)).toBe("rgba(41, 98, 255, 0.102)");
    expect(color.new("#2962ff", 100)).toBe("rgba(41, 98, 255, 0.000)");
  });
});

/** Three bars with distinct OHLC so the mid-price series are all different. */
function midCtx(): Context {
  return {
    open: [10, 20, 30],
    high: [12, 24, 36],
    low: [8, 16, 24],
    close: [11, 22, 33],
    volume: [100, 200, 300],
    barIndex: 2,
    inputs: {},
  };
}

describe("derived series and bare cross helpers", () => {
  it("plots hl2, hlc3 and ohlc4 as mid-price series", () => {
    const out = runPine('indicator("T")\nplot(hl2)\nplot(hlc3)\nplot(ohlc4)', midCtx());
    const [hl2, hlc3, ohlc4] = [out.plots[0]!, out.plots[1]!, out.plots[2]!];
    expect(values(hl2.values)).toEqual([10, 20, 30]);
    expect(values(hlc3.values)).toEqual([31 / 3, 62 / 3, 31]);
    expect(values(ohlc4.values)).toEqual([41 / 4, 20.5, 123 / 4]);
  });

  it("matches bare crossover to ta.crossover", () => {
    const ctx: Context = {
      open: [10, 10, 10, 10],
      high: [11, 11, 12, 12],
      low: [8, 8, 9, 9],
      close: [9, 9, 11, 11],
      volume: [1, 1, 1, 1],
      barIndex: 3,
      inputs: {},
    };
    // close dips below open, then crosses back up on bar 2.
    const bare = runPine("plot(crossover(close, open) ? 1 : 0)", ctx);
    const namespaced = runPine("plot(ta.crossover(close, open) ? 1 : 0)", ctx);
    expect(values(bare.plots[0]!.values)).toEqual([0, 0, 1, 0]);
    expect(values(bare.plots[0]!.values)).toEqual(values(namespaced.plots[0]!.values));
  });

  it("matches bare crossunder to ta.crossunder", () => {
    const ctx: Context = {
      open: [10, 10, 10, 10],
      high: [11, 12, 12, 12],
      low: [8, 9, 8, 8],
      close: [11, 11, 9, 9],
      volume: [1, 1, 1, 1],
      barIndex: 3,
      inputs: {},
    };
    // close sits above open, then crosses below on bar 2.
    const bare = runPine("plot(crossunder(close, open) ? 1 : 0)", ctx);
    const namespaced = runPine("plot(ta.crossunder(close, open) ? 1 : 0)", ctx);
    expect(values(bare.plots[0]!.values)).toEqual([0, 0, 1, 0]);
    expect(values(bare.plots[0]!.values)).toEqual(values(namespaced.plots[0]!.values));
  });
});

describe("sandbox (Phase A)", () => {
  it("rejects dangerous global identifiers", () => {
    for (const name of [
      "globalThis", "window", "document", "fetch", "XMLHttpRequest", "WebSocket",
      "Function", "eval", "constructor", "process", "require", "module", "exports",
      "setTimeout", "setInterval", "Promise", "Reflect", "Proxy",
    ]) {
      expect(() => transpile(name)).toThrow(PineUnsupportedError);
    }
  });

  it("rejects dangerous member access", () => {
    for (const m of ["constructor", "__proto__", "prototype", "then", "call", "apply", "bind", "toString", "valueOf"]) {
      expect(() => transpile(`close.${m}`)).toThrow(PineUnsupportedError);
    }
  });

  it("rejects a zero for-loop step at transpile time", () => {
    expect(() => transpile("for i = 0 to 10 by 0\n  x = i")).toThrow(PineUnsupportedError);
  });

  it("caps for-loop iterations at runtime", () => {
    const src = "float total = 0\nfor i = 0 to 200000\n  total := total + 1\nplot(total)";
    expect(() => runPine(src, makeContext(1))).toThrow(/too many iterations/);
  });

  it("caps while-loop iterations at runtime", () => {
    const src = "float total = 0\nwhile true\n  total := total + 1\nplot(total)";
    expect(() => runPine(src, makeContext(1))).toThrow(/too many iterations/);
  });

  it("validates the run context", () => {
    expect(() => runPine("plot(close)", { ...makeContext(3), close: [] } as Context)).toThrow(/non-empty/);
    const mismatched = makeContext(3);
    mismatched.high = [1, 2];
    expect(() => runPine("plot(close)", mismatched)).toThrow(/equal length/);
    const nonFinite = makeContext(3);
    nonFinite.close[0] = Number.NaN;
    expect(() => runPine("plot(close)", nonFinite)).toThrow(/finite/);
    const tooBig = makeContext(5001);
    expect(() => runPine("plot(close)", tooBig)).toThrow(/5000/);
  });

  it("shadows host globals inside the evaluator", () => {
    // `fetch` is rejected at transpile time, so runPine throws before eval.
    expect(() => runPine("plot(fetch)", makeContext(1))).toThrow(PineUnsupportedError);
  });
});

describe("lexer finite numbers", () => {
  it("rejects non-finite number literals", () => {
    expect(() => lex("1e10000")).toThrow(PineSyntaxError);
  });
});
