import { describe, expect, it, vi } from "vitest";
import { EMPTY_FUNDAMENTAL_EVENTS, fetchFundamentalEvents } from "./fundamentalEvents";
import { DEFAULT_EVENT_OPTIONS } from "./eventOptions";

const NOW = 1_700_000_000;
const DAY = 86400;

function stubSources(overrides: { calendar?: object; earnings?: object } = {}) {
  return {
    calendar: {
      getCalendar: vi.fn().mockResolvedValue([
        {
          id: "e1",
          time: NOW - DAY,
          currency: "USD",
          impact: "high" as const,
          title: "CPI y/y",
          source: "demo",
        },
      ]),
      ...overrides.calendar,
    },
    earnings: {
      getEarnings: vi.fn().mockResolvedValue([
        { symbol: "AAPL", time: NOW - 2 * DAY, quarter: "Q3", source: "demo" },
      ]),
      ...overrides.earnings,
    },
  };
}

describe("fetchFundamentalEvents", () => {
  it("merges earnings and the ±60d calendar into one overlay", async () => {
    const sources = stubSources();
    const overlay = await fetchFundamentalEvents(sources, "AAPL", NOW, DEFAULT_EVENT_OPTIONS);
    expect(overlay.markers).toEqual([
      { time: NOW - 2 * DAY, title: "AAPL", kind: "earnings" },
      { time: NOW - DAY, title: "CPI y/y", kind: "event", impact: "high" },
    ]);
    expect(overlay.lines).toEqual([NOW - DAY]);
    // Calendar is asked for the ±60 day window around `now`.
    expect(sources.calendar.getCalendar).toHaveBeenCalledWith(NOW - 60 * DAY, NOW + 60 * DAY);
    expect(sources.earnings.getEarnings).toHaveBeenCalledWith("AAPL");
  });

  it("applies the chosen event options to the overlay", async () => {
    const sources = stubSources({});
    const none = await fetchFundamentalEvents(sources, "AAPL", NOW, {
      earnings: false,
      economic: false,
      impacts: { high: true, medium: true, low: true },
    });
    expect(none).toEqual({ markers: [], lines: [] });
  });

  it("degrades to the empty overlay when a fetch rejects", async () => {
    const sources = stubSources({
      calendar: { getCalendar: vi.fn().mockRejectedValue(new Error("offline")) },
    });
    await expect(fetchFundamentalEvents(sources, "AAPL", NOW, DEFAULT_EVENT_OPTIONS)).resolves.toEqual(
      EMPTY_FUNDAMENTAL_EVENTS,
    );
  });

  it("degrades to the empty overlay when earnings reject", async () => {
    const sources = stubSources({
      earnings: { getEarnings: vi.fn().mockRejectedValue(new Error("no key")) },
    });
    await expect(fetchFundamentalEvents(sources, "AAPL", NOW, DEFAULT_EVENT_OPTIONS)).resolves.toEqual(
      EMPTY_FUNDAMENTAL_EVENTS,
    );
  });
});
