import { describe, expect, it } from "vitest";
import { fpsOf, formatCrash, trimLog } from "./diagnostics";

describe("diagnostics", () => {
  it("formats an error with ISO time, kind, message and stack", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at x";
    expect(formatCrash("error", err, new Date("2026-10-21T12:00:00Z"))).toBe(
      "[2026-10-21T12:00:00.000Z] error: boom\nError: boom\n    at x\n",
    );
  });

  it("formats non-Error rejection reasons", () => {
    const t = new Date("2026-10-21T12:00:00Z");
    expect(formatCrash("unhandledrejection", "plain", t)).toContain("unhandledrejection: plain");
    expect(formatCrash("unhandledrejection", { code: 7 }, t)).toContain('{"code":7}');
  });

  it("trims to the newest lines without splitting one", () => {
    const text = "aaaa\nbbbb\ncccc\n";
    expect(trimLog(text, 100)).toBe(text);
    expect(trimLog(text, 8)).toBe("cccc\n");
  });

  it("computes fps over a window", () => {
    expect(fpsOf(60, 1000)).toBe(60);
    expect(fpsOf(30, 500)).toBe(60);
    expect(fpsOf(10, 0)).toBe(0);
  });
});
