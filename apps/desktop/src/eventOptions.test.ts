import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_OPTIONS, eventsActive, restoreEventOptions, toOverlayOptions } from "./eventOptions";

describe("event options", () => {
  it("defaults to earnings plus high-impact economic events", () => {
    expect(DEFAULT_EVENT_OPTIONS).toEqual({
      earnings: true,
      economic: true,
      impacts: { high: true, medium: false, low: false },
    });
    expect(toOverlayOptions(DEFAULT_EVENT_OPTIONS)).toEqual({ showEarnings: true, showEvents: true, impacts: ["high"] });
  });

  it("maps every impact switch to the overlay's exact impact list", () => {
    const all = { earnings: false, economic: true, impacts: { high: true, medium: true, low: true } };
    expect(toOverlayOptions(all)).toEqual({ showEarnings: false, showEvents: true, impacts: ["high", "medium", "low"] });
  });

  it("is inactive only when nothing could be drawn", () => {
    expect(eventsActive(DEFAULT_EVENT_OPTIONS)).toBe(true);
    expect(eventsActive({ earnings: true, economic: false, impacts: { high: false, medium: false, low: false } })).toBe(true);
    expect(eventsActive({ earnings: false, economic: true, impacts: { high: false, medium: false, low: false } })).toBe(false);
    expect(eventsActive({ earnings: false, economic: false, impacts: { high: true, medium: true, low: true } })).toBe(false);
  });

  it("restores saved options and falls back per field on junk", () => {
    expect(restoreEventOptions({ earnings: false, economic: true, impacts: { high: false, medium: true, low: false } })).toEqual({
      earnings: false,
      economic: true,
      impacts: { high: false, medium: true, low: false },
    });
    expect(restoreEventOptions(undefined)).toEqual(DEFAULT_EVENT_OPTIONS);
    expect(restoreEventOptions("x")).toEqual(DEFAULT_EVENT_OPTIONS);
    expect(restoreEventOptions({ earnings: "yes", impacts: { high: 1, medium: true } })).toEqual({
      earnings: true,
      economic: true,
      impacts: { high: true, medium: true, low: false },
    });
  });
});
