import { describe, expect, it } from "vitest";
import { pineExportFilename } from "./PineEditor";
import { sanitizeExportFilename } from "./exportUi";

/**
 * The sanitizer's cases moved with it to exportUi.test.ts (Phase 8 made it
 * shared); this file keeps the Pine editor's wrapper itself pinned - same
 * rule, "script" fallback.
 */
describe("pineExportFilename", () => {
  it("is the shared filename sanitizer with the script fallback", () => {
    expect(pineExportFilename("My Script")).toBe(sanitizeExportFilename("My Script", "script"));
    expect(pineExportFilename("a/b")).toBe("ab");
    expect(pineExportFilename('<>:"/\\|?*')).toBe("script");
    expect(pineExportFilename("   ")).toBe("script");
  });
});
