import { describe, expect, it } from "vitest";

import { sessionBreaks, sessionFlagsAt } from "./sessionBreaks";

/**
 * Session shading reuses the background-band primitive, so the only new logic
 * is "which bars were outside the session". That is pure arithmetic over the
 * bar times, which is what these tests pin: the weekend, the overnight gap, and
 * the fact that a closed session paints nothing rather than guessing.
 */

// 2026-01-05 is a Monday; 2026-01-03 a Saturday.
const t = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

describe("sessionFlagsAt", () => {
  it("is open during a weekday equity session", () => {
    // 14:30-21:00 UTC is New York's window.
    expect(sessionFlagsAt(t("2026-01-05T15:00:00Z"), "newyork")).toBe(true);
    expect(sessionFlagsAt(t("2026-01-05T15:00:00Z"), "london")).toBe(true);
  });

  it("is closed outside the window and at the weekend", () => {
    expect(sessionFlagsAt(t("2026-01-05T02:00:00Z"), "newyork")).toBe(false);
    expect(sessionFlagsAt(t("2026-01-03T15:00:00Z"), "newyork")).toBe(false);
  });

  it("keeps crypto open at the weekend", () => {
    expect(sessionFlagsAt(t("2026-01-03T15:00:00Z"), "crypto")).toBe(true);
  });

  it("returns null for a session id that does not exist", () => {
    expect(sessionFlagsAt(t("2026-01-05T15:00:00Z"), "atlantis")).toBeNull();
  });
});

describe("sessionBreaks", () => {
  const monday = [
    t("2026-01-05T09:00:00Z"),
    t("2026-01-05T10:00:00Z"),
    t("2026-01-05T22:00:00Z"),
    t("2026-01-05T23:00:00Z"),
  ];

  it("marks the bars outside the session as breaks", () => {
    // London runs 08:00-16:30, so the two evening bars are breaks.
    expect(sessionBreaks(monday, "london")).toEqual([false, false, true, true]);
  });

  it("marks a whole weekend as one run of breaks", () => {
    // Friday's close through Monday's open. New York runs 14:30-21:00 UTC.
    const across = [t("2026-01-02T20:00:00Z"), t("2026-01-03T12:00:00Z"), t("2026-01-04T12:00:00Z"), t("2026-01-05T15:00:00Z")];
    expect(sessionBreaks(across, "newyork")).toEqual([false, true, true, false]);
  });

  it("returns an empty array for an unknown session, so nothing is painted", () => {
    expect(sessionBreaks(monday, "atlantis")).toEqual([]);
    expect(sessionBreaks([], "london")).toEqual([]);
  });

  it("never paints a break for crypto", () => {
    expect(sessionBreaks(monday, "crypto")).toEqual([false, false, false, false]);
  });
});
