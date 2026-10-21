import { describe, expect, it } from "vitest";

import { MARKET_SESSIONS, clockFor, isOpen, nextTransition, sessionState, utcOffsetLabel } from "./marketClock";

/**
 * The market clock is pure date math, so it is tested at fixed instants rather
 * than by mocking "now". Each expectation names the wall-clock time it means.
 */

const at = (iso: string): number => Date.parse(iso);

describe("session table", () => {
  it("lists the four majors and crypto, each with a UTC window", () => {
    const ids = MARKET_SESSIONS.map((s) => s.id);
    expect(ids).toEqual(["sydney", "tokyo", "london", "newyork", "crypto"]);
    for (const s of MARKET_SESSIONS) {
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.openUtc).toBeGreaterThanOrEqual(0);
      expect(s.openUtc).toBeLessThan(24 * 60);
      expect(s.closeUtc).toBeGreaterThanOrEqual(0);
      expect(s.closeUtc).toBeLessThanOrEqual(24 * 60);
    }
  });

  it("marks crypto as the one session that never closes", () => {
    expect(MARKET_SESSIONS.find((s) => s.id === "crypto")?.openUtc).toBe(MARKET_SESSIONS.find((s) => s.id === "crypto")?.closeUtc);
  });
});

describe("isOpen", () => {
  const london = MARKET_SESSIONS.find((s) => s.id === "london")!;

  it("is true inside the window and false outside it", () => {
    expect(isOpen(london, 10 * 60)).toBe(true);
    expect(isOpen(london, 3 * 60)).toBe(false);
  });

  it("treats the open minute as open and the close minute as closed", () => {
    expect(isOpen(london, london.openUtc)).toBe(true);
    expect(isOpen(london, london.closeUtc)).toBe(false);
  });

  it("is always true for a round-the-clock session", () => {
    const crypto = MARKET_SESSIONS.find((s) => s.id === "crypto")!;
    expect(isOpen(crypto, 0)).toBe(true);
    expect(isOpen(crypto, 23 * 60 + 59)).toBe(true);
  });
});

describe("clockFor", () => {
  it("reads a UTC instant as minutes past midnight", () => {
    // 2026-01-05 is a Monday.
    expect(clockFor(at("2026-01-05T14:30:00Z"))).toEqual({ minutes: 14 * 60 + 30, weekday: 1, isWeekend: false });
  });

  it("flags Saturday and Sunday", () => {
    expect(clockFor(at("2026-01-03T12:00:00Z")).isWeekend).toBe(true);
    expect(clockFor(at("2026-01-04T12:00:00Z")).isWeekend).toBe(true);
  });
});

describe("sessionState", () => {
  it("reports London open and New York closed at 10:00 UTC on a Monday", () => {
    const states = sessionState(at("2026-01-05T10:00:00Z"));
    const byId = Object.fromEntries(states.map((s) => [s.id, s.open]));
    expect(byId.london).toBe(true);
    expect(byId.newyork).toBe(false);
    expect(byId.crypto).toBe(true);
  });

  it("closes every equity session at the weekend but keeps crypto ticking", () => {
    const states = sessionState(at("2026-01-03T10:00:00Z"));
    const byId = Object.fromEntries(states.map((s) => [s.id, s.open]));
    expect(byId.london).toBe(false);
    expect(byId.tokyo).toBe(false);
    expect(byId.crypto).toBe(true);
  });
});

describe("nextTransition", () => {
  it("returns the next open when the session is closed", () => {
    const tokyo = MARKET_SESSIONS.find((s) => s.id === "tokyo")!;
    // Tokyo runs 00:00–06:00 UTC, so mid-morning London time it is shut.
    const next = nextTransition(tokyo, at("2026-01-05T10:00:00Z"));
    expect(next.kind).toBe("open");
    expect(next.at).toBe(at("2026-01-06T00:00:00Z"));
  });

  it("skips the weekend when finding the next open", () => {
    const newyork = MARKET_SESSIONS.find((s) => s.id === "newyork")!;
    // Saturday morning: New York is shut and does not reopen until Monday.
    const next = nextTransition(newyork, at("2026-01-03T10:00:00Z"));
    expect(next.kind).toBe("open");
    expect(new Date(next.at).getUTCDay()).toBe(1);
  });

  it("returns the next close when the session is open", () => {
    const london = MARKET_SESSIONS.find((s) => s.id === "london")!;
    const next = nextTransition(london, at("2026-01-05T10:00:00Z"));
    expect(next.kind).toBe("close");
    // London closes at 16:30 UTC in this table.
    expect(next.at).toBe(at("2026-01-05T16:30:00Z"));
  });
});

describe("utcOffsetLabel", () => {
  it("renders a positive offset with a sign and no minutes when whole", () => {
    expect(utcOffsetLabel(2)).toBe("UTC+2");
    expect(utcOffsetLabel(-5)).toBe("UTC-5");
  });

  it("renders half-hour offsets", () => {
    expect(utcOffsetLabel(5.5)).toBe("UTC+5:30");
    expect(utcOffsetLabel(-3.5)).toBe("UTC-3:30");
  });

  it("renders the zero offset without a sign", () => {
    expect(utcOffsetLabel(0)).toBe("UTC");
  });
});
