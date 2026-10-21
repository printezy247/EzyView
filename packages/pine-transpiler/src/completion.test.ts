import { describe, expect, it } from "vitest";
import { pineCompletions } from "./completion.js";
import type { PineCompletion } from "./completion.js";

const catalog = pineCompletions();
const labels = catalog.map((c) => c.label);
const byLabel = (label: string): PineCompletion | undefined => catalog.find((c) => c.label === label);

describe("pineCompletions", () => {
  it("is a frozen static catalog with a stable order", () => {
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(pineCompletions()).toEqual(catalog);
  });

  it("has no duplicate labels", () => {
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("covers the control-flow keywords", () => {
    for (const kw of ["if", "else", "for", "to", "by", "while", "var", "return", "and", "or", "not", "true", "false", "na"]) {
      expect(byLabel(kw)).toMatchObject({ label: kw, kind: "keyword" });
    }
  });

  it("covers the type keywords the parser accepts", () => {
    // `color` is also a namespace, so the namespace entry owns that label.
    for (const kw of ["int", "float", "bool", "string", "series", "simple"]) {
      expect(byLabel(kw)).toMatchObject({ label: kw, kind: "keyword" });
    }
  });

  it("covers the built-in series", () => {
    for (const name of ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4", "bar_index"]) {
      expect(byLabel(name)).toMatchObject({ label: name, kind: "builtin" });
    }
  });

  it("covers every namespace", () => {
    for (const ns of ["ta", "math", "color", "input", "strategy", "shape", "location", "size"]) {
      expect(byLabel(ns)).toMatchObject({ label: ns, kind: "namespace" });
    }
  });

  it("covers the emitter's top-level functions", () => {
    for (const fn of ["plot", "plotshape", "bgcolor", "indicator", "nz", "crossover", "crossunder"]) {
      expect(byLabel(fn)).toMatchObject({ label: fn, kind: "function" });
    }
  });

  it("covers exactly the ta.* members the runtime exports", () => {
    const members = [
      "sma", "ema", "rma", "wma", "stdev", "hma", "highest", "lowest",
      "change", "tr", "atr", "rsi", "crossover", "crossunder", "cross",
    ];
    for (const m of members) {
      expect(byLabel(`ta.${m}`)).toMatchObject({ label: `ta.${m}`, kind: "function", detail: "ta" });
    }
    expect(labels).not.toContain("ta.macd");
  });

  it("covers exactly the math.* members the runtime exports", () => {
    const members = [
      "abs", "max", "min", "round", "floor", "ceil", "sqrt",
      "pow", "log", "log10", "exp", "sign", "avg", "sum",
    ];
    for (const m of members) {
      expect(byLabel(`math.${m}`)).toMatchObject({ label: `math.${m}`, kind: "function", detail: "math" });
    }
    expect(labels).not.toContain("math.random");
  });

  it("covers the input.* constructors", () => {
    for (const m of ["int", "float", "bool", "string"]) {
      expect(byLabel(`input.${m}`)).toMatchObject({ label: `input.${m}`, kind: "function", detail: "input" });
    }
  });

  it("covers the supported strategy.* order calls", () => {
    for (const m of ["entry", "close", "exit", "close_all"]) {
      expect(byLabel(`strategy.${m}`)).toMatchObject({ label: `strategy.${m}`, kind: "function", detail: "strategy" });
    }
  });

  it("lists the namespace constants with dotted builtin labels", () => {
    expect(byLabel("color.red")).toMatchObject({ kind: "builtin", detail: "color" });
    expect(byLabel("color.new")).toMatchObject({ kind: "builtin", detail: "color" });
    expect(byLabel("shape.cross")).toMatchObject({ kind: "builtin", detail: "shape" });
    expect(byLabel("location.abovebar")).toMatchObject({ kind: "builtin", detail: "location" });
    expect(byLabel("size.auto")).toMatchObject({ kind: "builtin", detail: "size" });
  });

  it("gives every entry a non-empty detail", () => {
    for (const c of catalog) {
      expect(c.detail.length).toBeGreaterThan(0);
    }
  });
});
