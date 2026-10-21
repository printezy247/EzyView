import { describe, expect, it } from "vitest";
import { pineExportFilename } from "./PineEditor";

describe("pineExportFilename", () => {
  it("strips path separators and NUL, then trims", () => {
    expect(pineExportFilename("My Script")).toBe("My Script");
    expect(pineExportFilename("a/b")).toBe("ab");
    expect(pineExportFilename("a\\b")).toBe("ab");
    expect(pineExportFilename("a\u0000b")).toBe("ab");
    expect(pineExportFilename("  spaced  ")).toBe("spaced");
  });

  it("falls back to 'script' when nothing valid remains", () => {
    expect(pineExportFilename("")).toBe("script");
    expect(pineExportFilename("   ")).toBe("script");
    expect(pineExportFilename("/\\")).toBe("script");
  });
});
