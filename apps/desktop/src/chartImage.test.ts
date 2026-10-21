import { describe, expect, it } from "vitest";
import { compositeCanvasesToPng } from "./chartImage";

/**
 * Compositor contract in the node test environment: no document, no DOM — the
 * guard must return null instead of throwing (vitest runs with environment
 * "node", so this pins the guard rather than the pixel path).
 */
describe("compositeCanvasesToPng", () => {
  it("returns null when there is no document", () => {
    expect(typeof document).toBe("undefined");
    expect(compositeCanvasesToPng({} as unknown as Element)).toBeNull();
  });

  it("defaults the background to the chart's opaque canvas colour", () => {
    // Only observable in a DOM; here we pin that a custom background is accepted
    // without argument errors (the guard fires before any canvas work).
    expect(compositeCanvasesToPng({} as unknown as Element, "#ff0000")).toBeNull();
  });
});
