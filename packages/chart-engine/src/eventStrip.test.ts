import { describe, expect, it } from "vitest";
import type { Time } from "lightweight-charts";
import {
  EVENT_STRIP_CLUSTER_PX,
  EVENT_STRIP_HEIGHT,
  EventStripPrimitive,
  layoutEventStrip,
  type EventStripMarker,
} from "./eventStrip.js";

const marker = (over: Partial<EventStripMarker> & Pick<EventStripMarker, "time" | "title">): EventStripMarker => ({
  kind: "event",
  impact: "high",
  ...over,
});

/** Evenly spaced times map to 10 px apart: clustering never triggers. */
const scaleAt = (step = 10) => ({
  timeToCoordinate: (time: Time) => Number(time) * step,
});

describe("layoutEventStrip", () => {
  it("skips out-of-range times and lays the rest out by coordinate", () => {
    const scale = { timeToCoordinate: (t: Time) => (Number(t) === 2 ? null : Number(t) * 100) };
    const chips = layoutEventStrip(scale, [
      marker({ time: 1, title: "a" }),
      marker({ time: 2, title: "gone" }),
      marker({ time: 3, title: "c" }),
    ]);
    expect(chips.map((c) => c.members[0]!.title)).toEqual(["a", "c"]);
    expect(chips.map((c) => c.count)).toEqual([1, 1]);
    expect(chips[0]!.id).toBe("evstrip:0");
  });

  it("merges chips nearer than the cluster gap into one count badge", () => {
    const chips = layoutEventStrip(scaleAt(EVENT_STRIP_CLUSTER_PX - 1), [
      marker({ time: 1, title: "a", impact: "low" }),
      marker({ time: 2, title: "b", impact: "high" }),
      marker({ time: 100, title: "far" }),
    ]);
    expect(chips).toHaveLength(2);
    expect(chips[0]!.count).toBe(2);
    expect(chips[0]!.members.map((m) => m.title)).toEqual(["a", "b"]);
    // The badge takes the hottest member's colour.
    expect(chips[0]!.color).toBe("#f23645");
    expect(chips[1]!.count).toBe(1);
  });

  it("draws a lone earnings marker as an amber circle, clusters as squares", () => {
    const chips = layoutEventStrip(scaleAt(), [
      marker({ time: 1, title: "AAPL", kind: "earnings" }),
      marker({ time: 100, title: "NFP" }),
    ]);
    expect(chips[0]).toMatchObject({ shape: "circle", color: "#f0b90b", count: 1 });
    expect(chips[1]).toMatchObject({ shape: "square", count: 1 });
  });
});

const primitive = () => {
  const p = new EventStripPrimitive();
  p.attached({ chart: { timeScale: () => scaleAt() } as never, requestUpdate: () => {} });
  return p;
};

describe("EventStripPrimitive.hitTest", () => {

  it("returns null above the strip and the chip id inside it", () => {
    const p = primitive();
    p.setMarkers([marker({ time: 10, title: "NFP" })]);
    // No render yet, so no height: nothing is hittable.
    expect(p.hitTest(100, EVENT_STRIP_HEIGHT - 1)).toBeNull();
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      fillRect: () => {},
      rect: () => {},
    };
    p.render({
      useMediaCoordinateSpace: (fn: (scope: { context: unknown; mediaSize: { width: number; height: number } }) => void) =>
        fn({ context: ctx, mediaSize: { width: 800, height: 400 } }),
    } as never);
    // The marker at time 10 lands on x=100; the strip is the bottom band.
    expect(p.hitTest(0, 400 - 1)).toBeNull();
    const hit = p.hitTest(100, 400 - 1);
    expect(hit).toMatchObject({ externalId: "evstrip:0", cursorStyle: "pointer" });
    expect(p.chipAt(hit!.externalId as string)?.members[0]!.title).toBe("NFP");
    expect(p.hitTest(100, 400 - EVENT_STRIP_HEIGHT - 1)).toBeNull();
  });
});