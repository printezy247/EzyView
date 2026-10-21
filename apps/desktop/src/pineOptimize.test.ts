import { describe, expect, it } from "vitest";
import { parseParamValues } from "./pineOptimize";

describe("parseParamValues", () => {
  it("treats empty text as a skipped row", () => {
    expect(parseParamValues("")).toEqual([]);
    expect(parseParamValues("   ")).toEqual([]);
  });

  it("parses an inclusive step range", () => {
    expect(parseParamValues("10..50 step 10")).toEqual([10, 20, 30, 40, 50]);
    expect(parseParamValues("5..5 step 1")).toEqual([5]);
    expect(parseParamValues("0..1 step 0.25")).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("keeps a fractional step free of float drift", () => {
    expect(parseParamValues("0..1 step 0.1")).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it("rejects a non-positive step", () => {
    expect(parseParamValues("10..50 step 0")).toBeNull();
    expect(parseParamValues("10..50 step -10")).toBeNull();
  });

  it("rejects a stop below the start", () => {
    expect(parseParamValues("50..10 step 10")).toBeNull();
  });

  it("parses a comma list, including negatives and floats", () => {
    expect(parseParamValues("1,2,3")).toEqual([1, 2, 3]);
    expect(parseParamValues(" 1 , 2 ")).toEqual([1, 2]);
    expect(parseParamValues("2.5")).toEqual([2.5]);
    expect(parseParamValues("-1,-0.5,3")).toEqual([-1, -0.5, 3]);
  });

  it("rejects anything that is neither form", () => {
    expect(parseParamValues("abc")).toBeNull();
    expect(parseParamValues("1,,2")).toBeNull();
    expect(parseParamValues("10..50")).toBeNull();
    expect(parseParamValues("10..50 step")).toBeNull();
  });
});
