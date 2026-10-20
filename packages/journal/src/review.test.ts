import { describe, expect, it } from "vitest";
import { composeReview, dateKey, reviewWindow } from "./review";
import type { JournalEntry, JournalNote } from "./model";

const trade = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: Math.random().toString(36).slice(2),
  symbol: "XAUUSD",
  side: "long",
  qty: 1,
  entryPrice: 100,
  entryTime: 1000,
  exitPrice: 110,
  exitTime: 1110,
  pnl: 10,
  ...over,
});

const note = (over: Partial<JournalNote> = {}): JournalNote => ({
  id: Math.random().toString(36).slice(2),
  time: 1000,
  text: "Plan the session",
  ...over,
});

/** Epoch seconds for a local wall-clock time (tests stay portable across timezones). */
const local = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number =>
  Math.floor(new Date(year, month - 1, day, hour, minute, second).getTime() / 1000);

/** Open (unclosed) entry: never moves a stat, still counts toward "Trades". */
const open = (over: Partial<JournalEntry> = {}): JournalEntry =>
  trade({ pnl: undefined, exitTime: undefined, exitPrice: undefined, ...over });

describe("dateKey", () => {
  it("labels the local calendar day across the midnight edge", () => {
    expect(dateKey(local(2026, 10, 21, 23, 59))).toBe("2026-10-21");
    expect(dateKey(local(2026, 10, 21, 0, 0))).toBe("2026-10-21");
    expect(dateKey(local(2026, 10, 21, 0, 0) - 1)).toBe("2026-10-20");
    expect(dateKey(local(2026, 10, 22, 0, 0))).toBe("2026-10-22");
  });
});

describe("reviewWindow", () => {
  it("spans one local day daily and one ISO week weekly", () => {
    const day = reviewWindow("2026-01-15", "daily");
    const week = reviewWindow("2026-01-15", "weekly");
    expect(day.end - day.start).toBe(86_400);
    expect(week.end - week.start).toBe(7 * 86_400);
    expect(day.start).toBe(local(2026, 1, 15));
    expect(day.end).toBe(local(2026, 1, 16));
  });

  it("starts the week on Monday 00:00 local", () => {
    // 2026-01-14 is a Wednesday, so its week opens on Monday 2026-01-12.
    const week = reviewWindow("2026-01-14", "weekly");
    expect(week.start).toBe(local(2026, 1, 12));
    expect(week.end).toBe(local(2026, 1, 19));
  });

  it("keeps Sunday 23:59 in that Monday's week and starts fresh at Monday 00:00", () => {
    // 2026-01-18 is a Sunday; 2026-01-19 is the following Monday.
    const sundayWeek = reviewWindow(dateKey(local(2026, 1, 18, 23, 59)), "weekly");
    expect(sundayWeek.start).toBe(local(2026, 1, 12));
    expect(local(2026, 1, 18, 23, 59)).toBeGreaterThanOrEqual(sundayWeek.start);
    expect(local(2026, 1, 18, 23, 59)).toBeLessThan(sundayWeek.end);

    const mondayWeek = reviewWindow("2026-01-19", "weekly");
    expect(mondayWeek.start).toBe(local(2026, 1, 19));
    expect(local(2026, 1, 19, 0, 0)).toBeGreaterThanOrEqual(mondayWeek.start);
    expect(local(2026, 1, 19, 0, 0)).toBe(sundayWeek.end);
  });
});

describe("composeReview", () => {
  it("returns the exact empty message when the window has no entries and no notes", () => {
    expect(composeReview([], [], 1000, 2000)).toBe("No trades and no notes.");
    expect(composeReview([trade({ entryTime: 999 })], [note({ time: 2000 })], 1000, 2000)).toBe(
      "No trades and no notes.",
    );
  });

  it("counts only entries whose entryTime falls in [start, end)", () => {
    const before = open({ entryTime: 999 });
    const last = open({ entryTime: 1999 });
    const atEnd = open({ entryTime: 2000 });
    expect(composeReview([before, last, atEnd], [], 1000, 2000)).toBe("Trades: 1");
  });

  it("emits every line of the full template in order", () => {
    const entries = [
      trade({ entryTime: 1500, pnl: 12.5, rules: [{ label: "setup", done: true }, { label: "risk", done: false }] }),
      trade({ entryTime: 1600, pnl: -3, rules: [{ label: "setup", done: true }] }),
      open({ entryTime: 1700 }),
    ];
    const notes = [note({ time: 1550 }), note({ time: 3000 })];
    expect(composeReview(entries, notes, 1000, 2000)).toBe(
      [
        "Trades: 3",
        "Wins 1 · Losses 1 · Breakeven 0",
        "Net +9.50",
        "Win rate 50%",
        "Best +12.50",
        "Worst -3.00",
        "Rule adherence 67% (2/3)",
        "Notes 1",
      ].join("\n"),
    );
  });

  it("formats a losing window with signed money", () => {
    expect(composeReview([trade({ entryTime: 1500, pnl: -3 })], [], 1000, 2000)).toBe(
      ["Trades: 1", "Wins 0 · Losses 1 · Breakeven 0", "Net -3.00", "Win rate 0%", "Best -3.00", "Worst -3.00"].join(
        "\n",
      ),
    );
  });

  it("shows +0.00 for break-even P&L and drops zero best/worst lines", () => {
    expect(composeReview([trade({ entryTime: 1500, pnl: 0 })], [], 1000, 2000)).toBe(
      ["Trades: 1", "Wins 0 · Losses 0 · Breakeven 1", "Net +0.00", "Win rate 0%"].join("\n"),
    );
  });

  it("reports only the trade count when nothing is closed", () => {
    expect(composeReview([open({ entryTime: 1500 })], [], 1000, 2000)).toBe("Trades: 1");
  });

  it("rounds win rate to the nearest integer percent", () => {
    const text = composeReview([trade({ pnl: 5 }), trade({ pnl: -1 }), trade({ pnl: -1 })], [], 1000, 2000);
    expect(text).toContain("Win rate 33%");
  });

  it("aggregates rule checks across every closed entry in the window", () => {
    const entries = [
      trade({
        entryTime: 1100,
        rules: [
          { label: "setup", done: true },
          { label: "risk", done: true },
          { label: "news", done: false },
        ],
      }),
      trade({ entryTime: 1200, rules: [{ label: "setup", done: true }] }),
      // Open entries never contribute, even with a checklist.
      open({ entryTime: 1300, rules: [{ label: "setup", done: true }] }),
    ];
    expect(composeReview(entries, [], 1000, 2000)).toContain("Rule adherence 75% (3/4)");
  });

  it("omits the adherence line when no closed entry carries rules", () => {
    const text = composeReview([trade({ entryTime: 1500, rules: undefined })], [], 1000, 2000);
    expect(text).not.toContain("Rule adherence");
  });

  it("counts only notes whose time falls in [start, end)", () => {
    const notes = [note({ time: 999 }), note({ time: 1000 }), note({ time: 1999 }), note({ time: 2000 })];
    expect(composeReview([], notes, 1000, 2000)).toBe(["Trades: 0", "Notes 2"].join("\n"));
  });
});
