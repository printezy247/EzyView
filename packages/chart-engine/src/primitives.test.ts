import { describe, expect, it, vi } from "vitest";
import type { Candle } from "@ezyview/data-adapters";
import type { Time } from "lightweight-charts";
import { BgBandsPrimitive } from "./bands.js";
import { FundamentalLinesPrimitive } from "./fundamentalLines.js";
import { VolumeProfilePrimitive, withAlpha } from "./volumeProfile.js";

type AnyRecord = Record<string, any>;

const TIMES = [1000, 2000, 3000, 4000, 5000].map((t) => t as unknown as Time);
const CANDLES: Candle[] = [1000, 2000, 3000, 4000, 5000].map((time, i) => ({
  time,
  open: 100 + i,
  high: 105 + i,
  low: 95 + i,
  close: 102 + i,
  volume: 100 * (i + 1),
}));

function mediaTarget(width: number, height: number) {
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
  };
  const target = {
    useMediaCoordinateSpace: (cb: (scope: { context: typeof ctx; mediaSize: { width: number; height: number } }) => void) =>
      cb({ context: ctx, mediaSize: { width, height } }),
  };
  return { target: target as never, ctx };
}

function fakeChart(visible?: { from: number; to: number }) {
  return {
    timeScale: () => ({
      getVisibleRange: () => visible ?? { from: 500, to: 6000 },
      timeToCoordinate: (t: Time) => Number(t) / 10,
    }),
  } as never;
}

describe("BgBandsPrimitive", () => {
  it("notifies on setBands only while attached, and stops after detach", () => {
    const p = new BgBandsPrimitive();
    const requestUpdate = vi.fn();
    p.setBands([{ color: "#f00", flags: [true] }], TIMES);
    expect(requestUpdate).not.toHaveBeenCalled();
    p.attached({ chart: fakeChart(), requestUpdate });
    p.setBands([{ color: "#f00", flags: [true] }], TIMES);
    expect(requestUpdate).toHaveBeenCalledTimes(1);
    p.detached();
    p.setBands([{ color: "#f00", flags: [true] }], TIMES);
    expect(requestUpdate).toHaveBeenCalledTimes(1);
  });

  it("paneViews only when it has something to paint", () => {
    const p = new BgBandsPrimitive();
    p.attached({ chart: fakeChart(), requestUpdate: () => {} });
    expect(p.paneViews()).toEqual([]);
    p.setBands([{ color: "#f00", flags: [true] }], TIMES);
    expect(p.paneViews()).toHaveLength(1);
    expect(p.paneViews()[0]!.zOrder?.()).toBe("bottom");
  });

  it("paints the lit bars, clipping to the visible range", () => {
    const p = new BgBandsPrimitive();
    p.attached({ chart: fakeChart({ from: 2500, to: 4500 }), requestUpdate: () => {} });
    p.setBands([{ color: "#f00", flags: [true, true, true, true, true] }], TIMES);
    const { target, ctx } = mediaTarget(100, 60);
    (p as unknown as AnyRecord)["render"].call(p, target);
    // Times 2000..4000 fall inside the visible window (3000..4000 lit).
    expect(ctx.fillRect).toHaveBeenCalled();
    for (const call of ctx.fillRect.mock.calls) {
      expect(call[3]).toBe(60);
    }
    expect(ctx.fillStyle).toBe("#f00");
  });

  it("skips null coordinates without throwing", () => {
    const p = new BgBandsPrimitive();
    const chart = {
      timeScale: () => ({
        getVisibleRange: () => null,
        timeToCoordinate: () => null,
      }),
    } as never;
    p.attached({ chart, requestUpdate: () => {} });
    p.setBands([{ color: "#f00", flags: [true, true] }], TIMES.slice(0, 2));
    const { target, ctx } = mediaTarget(100, 60);
    expect(() => (p as unknown as AnyRecord)["render"].call(p, target)).not.toThrow();
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it("renderer delegates draw() to the owner", () => {
    const p = new BgBandsPrimitive();
    p.attached({ chart: fakeChart(), requestUpdate: () => {} });
    p.setBands([{ color: "#f00", flags: [true] }], TIMES.slice(0, 1));
    const view = p.paneViews()[0]!;
    const renderer = view.renderer();
    expect(renderer).not.toBeNull();
    const spy = vi.spyOn(p, "render").mockImplementation(() => {});
    renderer!.draw({} as never);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("FundamentalLinesPrimitive", () => {
  it("is silent until lines are set, then notifies", () => {
    const p = new FundamentalLinesPrimitive();
    const requestUpdate = vi.fn();
    p.attached({ chart: fakeChart(), requestUpdate });
    expect(p.paneViews()).toEqual([]);
    p.setLines([{ time: 2000, color: "#f00" }]);
    expect(requestUpdate).toHaveBeenCalledTimes(1);
    expect(p.paneViews()).toHaveLength(1);
  });

  it("draws one dashed line per coordinate, skipping the missing ones", () => {
    const p = new FundamentalLinesPrimitive();
    const chart = {
      timeScale: () => ({
        timeToCoordinate: (t: Time) => (Number(t) === 3000 ? null : Number(t) / 10),
      }),
    } as never;
    p.attached({ chart, requestUpdate: () => {} });
    p.setLines([
      { time: 1000, color: "#f00" },
      { time: 3000, color: "#0f0" },
      { time: 5000, color: "#00f" },
    ]);
    const { target, ctx } = mediaTarget(100, 70);
    (p as unknown as AnyRecord)["render"].call(p, target);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    expect(ctx.globalAlpha).toBe(0.55);
  });

  it("renderer draws nothing before attach", () => {
    const p = new FundamentalLinesPrimitive();
    const { target, ctx } = mediaTarget(100, 70);
    p.setLines([{ time: 1000, color: "#f00" }]);
    (p as unknown as AnyRecord)["render"].call(p, target);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

describe("VolumeProfilePrimitive", () => {
  it("withAlpha blends hex colours and passes the rest through", () => {
    expect(withAlpha("#26a69a", 0.28)).toBe("rgba(38,166,154,0.28)");
    expect(withAlpha("#abc", 0.5)).toBe("rgba(170,187,204,0.5)");
    expect(withAlpha("teal", 0.5)).toBe("teal");
    expect(withAlpha("#26a69a", 0)).toBe("rgba(38,166,154,0)");
  });

  it("notifies on setCandles only when enabled", () => {
    const p = new VolumeProfilePrimitive(() => 0);
    const requestUpdate = vi.fn();
    p.attached({ chart: fakeChart(), requestUpdate });
    p.setCandles(CANDLES);
    expect(requestUpdate).not.toHaveBeenCalled();
    p.setEnabled(true);
    expect(requestUpdate).toHaveBeenCalledTimes(1);
    p.setCandles([CANDLES[0]!]);
    expect(requestUpdate).toHaveBeenCalledTimes(2);
  });

  it("paneViews follows the enabled flag and candle list", () => {
    const p = new VolumeProfilePrimitive(() => 0);
    p.attached({ chart: fakeChart(), requestUpdate: () => {} });
    expect(p.paneViews()).toEqual([]);
    p.setEnabled(true);
    expect(p.paneViews()).toEqual([]);
    p.setCandles(CANDLES);
    expect(p.paneViews()).toHaveLength(1);
  });

  it("render paints rows scaled to the visible window", () => {
    const p = new VolumeProfilePrimitive((price) => 100 - price);
    p.attached({ chart: fakeChart({ from: 1500, to: 4500 }), requestUpdate: () => {} });
    p.setEnabled(true);
    p.setCandles(CANDLES);
    p.setColors("#26a69a", "#ef5350");
    const { target, ctx } = mediaTarget(200, 100);
    (p as unknown as AnyRecord)["render"].call(p, target);
    expect(ctx.fillRect).toHaveBeenCalled();
    // Every drawn bar stays inside the canvas width.
    for (const call of ctx.fillRect.mock.calls) {
      expect(call[0]).toBeGreaterThanOrEqual(0);
      expect(call[0] + call[2]).toBeLessThanOrEqual(200);
    }
  });

  it("render is a no-op when the profile has no POC (empty window)", () => {
    const p = new VolumeProfilePrimitive((price) => 100 - price);
    p.attached({ chart: fakeChart({ from: 99999, to: 100000 }), requestUpdate: () => {} });
    p.setEnabled(true);
    p.setCandles(CANDLES);
    const { target, ctx } = mediaTarget(200, 100);
    (p as unknown as AnyRecord)["render"].call(p, target);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
