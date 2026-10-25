import { describe, expect, it } from "vitest";
import { getDrawingLevels, priceAt, simplifyRdp } from "./geometry.js";
import type { Drawing } from "./types.js";

const mockDrawing = (tool: Drawing["tool"], points: { time: number; price: number }[], style: Drawing["style"] = { color: "#fff", width: 1, lineStyle: "solid" }): Drawing => ({
  id: "d",
  tool,
  points,
  style,
});

describe("geometry", () => {
  describe("simplifyRdp", () => {
    it("simplifies a 10k-point stroke to store < 2k points", () => {
      // Create 10,000 points along a smooth curve with tiny perturbations
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < 10_000; i++) {
        const x = i * 0.1;
        // smooth wave with small sub-pixel noise
        const y = Math.sin(i * 0.005) * 100 + (Math.sin(i * 0.5) * 0.2);
        points.push({ x, y });
      }

      const simplified = simplifyRdp(points, 1.75);
      expect(simplified.length).toBeLessThan(2_000);
      expect(simplified.length).toBeGreaterThan(10);
    });

    it("preserves endpoints and small point sets", () => {
      const small = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
      expect(simplifyRdp(small, 2)).toEqual(small);
    });
  });

  describe("priceAt and getDrawingLevels", () => {
    it("calculates priceAt for straight trend lines", () => {
      const line = mockDrawing("trend_line", [
        { time: 100, price: 50 },
        { time: 200, price: 100 },
      ]);
      expect(priceAt(line, 100)).toBe(50);
      expect(priceAt(line, 150)).toBe(75);
      expect(priceAt(line, 200)).toBe(100);
    });

    it("calculates priceAt for parallel channels", () => {
      const channel = mockDrawing("parallel_channel", [
        { time: 100, price: 50 },
        { time: 200, price: 50 },
        { time: 150, price: 80 },
      ]);
      expect(priceAt(channel, 150, "base")).toBe(50);
      expect(priceAt(channel, 150, "middle")).toBe(65);
      expect(priceAt(channel, 150, "channel")).toBe(80);
    });

    it("calculates priceAt for fib retracement levels", () => {
      const fib = mockDrawing("fib_retracement", [
        { time: 100, price: 0 },
        { time: 200, price: 100 },
      ]);
      expect(priceAt(fib, 150, "0.5")).toBe(50);
      expect(priceAt(fib, 150, "0.618")).toBe(61.8);
      const levels = getDrawingLevels(fib, 150);
      expect(levels.some((l) => l.key === "0.5" && l.price === 50)).toBe(true);
      expect(levels.some((l) => l.key === "0.618" && l.price === 61.8)).toBe(true);
    });
  });
});
