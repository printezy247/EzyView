import { describe, expect, it } from "vitest";
import { chartPngFilename, dataUrlToBlob, sanitizeExportFilename, saveFilterFor } from "./exportUi";

/**
 * The sanitizer moved here from PineEditor (pineExportFilename) in Phase 8 so
 * every export path shares one filename rule; the Pine cases are migrated
 * verbatim, with "script" standing in for the Pine editor's default fallback.
 */
const pine = (name: string): string => sanitizeExportFilename(name, "script");

describe("sanitizeExportFilename", () => {
  it("strips path separators and NUL, then trims", () => {
    expect(pine("My Script")).toBe("My Script");
    expect(pine("a/b")).toBe("ab");
    expect(pine("a\\b")).toBe("ab");
    expect(pine("a\u0000b")).toBe("ab");
    expect(pine("../../../etc/passwd")).toBe("etcpasswd");
    expect(pine("..\\..\\windows")).toBe("windows");
    expect(pine("  spaced  ")).toBe("spaced");
  });

  it("strips every C0 control char and Windows-reserved filename char", () => {
    expect(pine("a<b>:c")).toBe("abc");
    expect(pine('a"b/c\\d|e?f*g')).toBe("abcdefg");
    expect(pine("a\r\nb")).toBe("ab"); // CR/LF survive JSON round-trips
    expect(pine("\ttab")).toBe("tab");
    expect(pine("a\u001fb")).toBe("ab"); // upper C0 bound
    expect(pine(" spaced \r\n ")).toBe("spaced"); // trim runs after stripping
  });

  it("falls back to the caller's fallback when nothing valid remains", () => {
    expect(pine("")).toBe("script");
    expect(pine("   ")).toBe("script");
    expect(pine("/\\")).toBe("script");
    expect(pine('<>:"/\\|?*\u0000\u001f')).toBe("script");
    // The fallback is a parameter, not a hard-coded "script".
    expect(sanitizeExportFilename("/\\", "chart")).toBe("chart");
    expect(sanitizeExportFilename("\u0000\u001f", "chart")).toBe("chart");
  });
});

describe("chartPngFilename", () => {
  it("is chart-<symbol>-<resolution>.png with unsafe chars stripped", () => {
    expect(chartPngFilename({ symbol: "BTCUSDT", resolution: "1D" })).toBe("chart-BTCUSDT-1D.png");
    // Symbols carry a provider prefix ("BINANCE:BTCUSDT"); the colon goes.
    expect(chartPngFilename({ symbol: "BINANCE:BTCUSDT", resolution: "1m" })).toBe("chart-BINANCEBTCUSDT-1m.png");
  });

  it("degrades to a safe name when the meta is empty", () => {
    expect(chartPngFilename({ symbol: "", resolution: "" })).toBe("chart--.png");
  });
});

describe("save helpers", () => {
  it("derives a dialog filter from the file name", () => {
    expect(saveFilterFor("chart-BTC-1D.png")).toEqual({ name: "PNG", extensions: ["png"] });
    expect(saveFilterFor("layout-x.JSON")).toEqual({ name: "JSON", extensions: ["json"] });
    expect(saveFilterFor("noext")).toEqual({ name: "All files", extensions: ["*"] });
  });

  it("decodes a base64 data URL to a typed Blob of the same bytes", async () => {
    const blob = dataUrlToBlob(`data:image/png;base64,${btoa("\x89PNG")}`);
    expect(blob.type).toBe("image/png");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
