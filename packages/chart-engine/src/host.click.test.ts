import { describe, expect, it } from "vitest";
import { EzyChart } from "./host.js";

/**
 * Phase 0 acceptance: `screenToTimePrice` is the single validity gate for
 * click → anchor placement. It must never return non-finite numbers, must
 * distinguish "outside chart" from "non-finite", and must increment the debug
 * click counter exactly once per call.
 *
 * The method touches only `clickCount`, `lastClick`, `coordinateToTime` and
 * `coordinateToPrice` on `this`, so it can be exercised against a stubbed
 * instance — no DOM and no live chart needed.
 */
interface Stub {
  clickCount: number;
  lastClick: { x: number; y: number; t: number } | null;
  coordinateToTime(x: number): number | null;
  coordinateToPrice(y: number): number | null;
}

function stub(times: (x: number) => number | null, prices: (y: number) => number | null): Stub {
  return { clickCount: 0, lastClick: null, coordinateToTime: times, coordinateToPrice: prices };
}

type ScreenResult = { ok: boolean; time: number | null; price: number | null; reason: string | null };

const screenToTimePrice = EzyChart.prototype.screenToTimePrice as unknown as (
  this: Stub,
  x: number,
  y: number,
) => ScreenResult;

const call = (self: Stub, x: number, y: number): ScreenResult => screenToTimePrice.call(self, x, y);

describe("EzyChart.screenToTimePrice", () => {
  it("accepts a click that projects to finite time and price", () => {
    const self = stub(
      () => 1700000000,
      () => 1.2345,
    );
    const r = call(self, 120, 80);
    expect(r).toEqual({ ok: true, time: 1700000000, price: 1.2345, reason: null });
  });

  it("rejects non-finite screen coordinates before projecting", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const self = stub(
        () => 1700000000,
        () => 1.5,
      );
      expect(call(self, bad, 10)).toMatchObject({ ok: false, reason: "non-finite", time: null, price: null });
      expect(call(self, 10, bad)).toMatchObject({ ok: false, reason: "non-finite" });
    }
  });

  it("reports 'outside chart' when a projection misses the plot area", () => {
    const nullTime = stub(
      () => null,
      () => 1.5,
    );
    expect(call(nullTime, 500, 10)).toMatchObject({ ok: false, reason: "outside chart" });
    const nullPrice = stub(
      () => 1700000000,
      () => null,
    );
    expect(call(nullPrice, 10, 500)).toMatchObject({ ok: false, reason: "outside chart" });
  });

  it("reports 'non-finite' when a projection yields NaN or Infinity", () => {
    const self = stub(
      () => NaN,
      () => 1.5,
    );
    expect(call(self, 10, 10)).toMatchObject({ ok: false, reason: "non-finite" });
    const infPrice = stub(
      () => 1700000000,
      () => Infinity,
    );
    expect(call(infPrice, 10, 10)).toMatchObject({ ok: false, reason: "non-finite" });
  });

  it("increments the debug counter once per call — one click, one count", () => {
    const self = stub(
      () => 1700000000,
      () => 1.5,
    );
    // 100 consecutive "clicks": valid and rejected alike each count exactly once.
    for (let i = 0; i < 50; i += 1) call(self, 10 + i, 20 + i);
    for (let i = 0; i < 50; i += 1) call(self, NaN, 20);
    expect(self.clickCount).toBe(100);
    expect(self.lastClick).not.toBeNull();
  });

  it("never leaks a non-finite time or price on the ok path", () => {
    const self = stub(
      (x) => x,
      (y) => y,
    );
    const probes: [number, number][] = [
      [1, 1],
      [1e9, 1e6],
      [0, 0],
    ];
    for (const [x, y] of probes) {
      const r = call(self, x, y);
      if (r.ok) {
        expect(Number.isFinite(r.time)).toBe(true);
        expect(Number.isFinite(r.price)).toBe(true);
      }
    }
  });
});
