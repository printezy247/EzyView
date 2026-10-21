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

  it("strips every C0 control char and Windows-reserved filename char", () => {
    expect(pineExportFilename("a<b>:c")).toBe("abc");
    expect(pineExportFilename('a"b/c\\d|e?f*g')).toBe("abcdefg");
    expect(pineExportFilename("a\r\nb")).toBe("ab"); // CR/LF survive JSON round-trips
    expect(pineExportFilename("\ttab")).toBe("tab");
    expect(pineExportFilename("a\u001fb")).toBe("ab"); // upper C0 bound
    expect(pineExportFilename(" spaced \r\n ")).toBe("spaced"); // trim runs after stripping
  });

  it("falls back to 'script' when nothing valid remains", () => {
    expect(pineExportFilename("")).toBe("script");
    expect(pineExportFilename("   ")).toBe("script");
    expect(pineExportFilename("/\\")).toBe("script");
    expect(pineExportFilename('<>:"/\\|?*\u0000\u001f')).toBe("script");
  });
});
