import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalEntry } from "@ezyview/journal";

/**
 * The store reads localStorage once at import (`const boot = readState()`), so
 * every test arms storage first, resets the module graph, and re-imports.
 * Node environment — localStorage stubbed by hand (same Map pattern as
 * drawingTemplates.test.ts).
 */

const KEY = "ezyview.journal.v1";

const h = vi.hoisted(() => ({ storage: new Map<string, string>() }));

function armLocalStorage(): void {
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => h.storage.get(k) ?? null,
    setItem: (k: string, v: string) => void h.storage.set(k, v),
    removeItem: (k: string) => void h.storage.delete(k),
  };
}

function disarmLocalStorage(): void {
  delete (globalThis as Record<string, unknown>).localStorage;
}

type JournalModule = typeof import("./journal");

/** The module instance the last `loadStore()` produced. */
let current: JournalModule | null = null;

/** Fresh module instance booted from whatever is currently in storage. */
async function loadStore(): Promise<JournalModule> {
  armLocalStorage();
  vi.resetModules();
  current = await import("./journal");
  return current;
}

/** What is on disk. Writes are debounced, so the pending one is flushed first. */
function persisted(): Record<string, unknown> {
  current?.flushJournal();
  const raw = h.storage.get(KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

const entry = (over: Partial<JournalEntry> = {}): Omit<JournalEntry, "id"> => ({
  symbol: "EURUSD",
  side: "long",
  qty: 1,
  entryPrice: 1.1,
  entryTime: 1700000000,
  ...over,
});

const withRules = (): Omit<JournalEntry, "id"> =>
  entry({
    rules: [
      { label: "R1", done: false },
      { label: "R2", done: true },
    ],
  });

beforeEach(() => {
  h.storage.clear();
  disarmLocalStorage();
  return () => disarmLocalStorage();
});

describe("backward-compatible restore", () => {
  it("restores an old {entries, notes}-only blob with zero data loss", async () => {
    const oldEntries = [{ id: "e1", symbol: "XAUUSD", side: "short", qty: 2, entryPrice: 1900, entryTime: 1 }];
    const oldNotes = [{ id: "n1", time: 2, text: "watch London open" }];
    h.storage.set(KEY, JSON.stringify({ entries: oldEntries, notes: oldNotes }));

    const { useJournal } = await loadStore();
    const s = useJournal.getState();
    expect(s.entries).toEqual(oldEntries);
    expect(s.notes).toEqual(oldNotes);
    expect(s.savedReviews).toEqual([]);
    expect(s.propFirm).toEqual({});
  });

  it("defaults missing or non-array reviews and invalid prop-firm limits", async () => {
    h.storage.set(
      KEY,
      JSON.stringify({
        entries: [],
        notes: [],
        savedReviews: "nope",
        propFirm: { dailyLossLimit: -5, maxDrawdownLimit: "100" },
      }),
    );
    const { useJournal } = await loadStore();
    expect(useJournal.getState().savedReviews).toEqual([]);
    expect(useJournal.getState().propFirm).toEqual({});
  });

  it("drops malformed review rows, keeps valid ones, caps at 200", async () => {
    const good = { id: "r1", key: "2026-10-20", period: "daily", text: "ok", savedAt: 5 };
    const rows = [
      good,
      { id: 42, key: "x", period: "daily", text: "bad id" },
      { id: "r2", key: "x" }, // missing text/period
      ...Array.from({ length: 250 }, (_, i) => ({
        id: `bulk${i}`,
        key: `2026-01-${String(i % 28).padStart(2, "0")}`,
        period: "weekly",
        text: "t",
        savedAt: i,
      })),
    ];
    h.storage.set(KEY, JSON.stringify({ entries: [], notes: [], savedReviews: rows }));
    const { useJournal } = await loadStore();
    const reviews = useJournal.getState().savedReviews;
    expect(reviews).toHaveLength(200);
    expect(reviews[0]).toEqual(good);
    expect(reviews.every((r) => typeof r.id === "string" && typeof r.text === "string")).toBe(true);
  });

  it("keeps only positive-number prop-firm limits", async () => {
    h.storage.set(
      KEY,
      JSON.stringify({
        entries: [],
        notes: [],
        propFirm: { dailyLossLimit: 500, maxDrawdownLimit: 0 },
      }),
    );
    const { useJournal } = await loadStore();
    expect(useJournal.getState().propFirm).toEqual({ dailyLossLimit: 500 });
  });
});

describe("bulk edit and account filter", () => {
  it("updateEntries merges into every listed id in one write", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().addEntry(entry({ symbol: "EURUSD", source: "mt5" }));
    useJournal.getState().addEntry(entry({ symbol: "GBPUSD", source: "paper" }));
    const ids = useJournal.getState().entries.map((e) => e.id);
    useJournal.getState().updateEntries(ids, { setup: "breakout" });
    for (const e of useJournal.getState().entries) expect(e.setup).toBe("breakout");
    // Persisted exactly once per entry, ids untouched.
    const saved = persisted() as { entries: { id: string; setup?: string }[] };
    expect(saved.entries.map((e) => e.setup)).toEqual(["breakout", "breakout"]);
  });

  it("updateEntries tolerates unknown ids and empty lists", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().addEntry(entry());
    const before = useJournal.getState().entries;
    useJournal.getState().updateEntries([], { tags: ["x"] });
    useJournal.getState().updateEntries(["nope"], { tags: ["x"] });
    expect(useJournal.getState().entries).toEqual(before);
  });

  it("removeEntries deletes only the listed ids and reports the count", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().addEntry(entry({ symbol: "A" }));
    useJournal.getState().addEntry(entry({ symbol: "B" }));
    useJournal.getState().addEntry(entry({ symbol: "C" }));
    const ids = useJournal.getState().entries.map((e) => e.id);
    expect(useJournal.getState().removeEntries([ids[1]!, ids[2]!])).toBe(2);
    // addEntry prepends, so the newest symbol is first after two deletions.
    const remaining = useJournal.getState().entries.map((e) => e.symbol);
    expect(remaining).toEqual(["C"]);
    expect(useJournal.getState().removeEntries(["gone"])).toBe(0);
  });

  it("sourceFilter and setSourceFilter round-trip (journal data itself unmoved)", async () => {
    const { useJournal } = await loadStore();
    expect(useJournal.getState().sourceFilter).toBe("any");
    useJournal.getState().setSourceFilter("mt5");
    expect(useJournal.getState().sourceFilter).toBe("mt5");
    // The filter is session state: it never lands on disk.
    expect(persisted().sourceFilter).toBeUndefined();
  });
});

describe("addEntry", () => {
  it("prepends with a generated id and persists", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().addEntry(entry());
    useJournal.getState().addEntry(entry({ symbol: "BTCUSDT" }));
    const ids = useJournal.getState().entries.map((e) => e.symbol);
    expect(ids).toEqual(["BTCUSDT", "EURUSD"]);
    expect(useJournal.getState().entries.every((e) => e.id.length > 0)).toBe(true);
    expect((persisted().entries as unknown[]).length).toBe(2);
  });

  it("trims, drops empties and dedupes tags preserving first-seen order", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().addEntry(entry({ tags: [" trend ", "trend", "breakout", "", "  ", "breakout"] }));
    expect(useJournal.getState().entries[0]?.tags).toEqual(["trend", "breakout"]);
  });

  it("omits the tags key when nothing survives dedupe", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().addEntry(entry({ tags: ["   ", ""] }));
    expect("tags" in (useJournal.getState().entries[0] ?? {})).toBe(false);
  });
});

describe("saveReview / removeReview", () => {
  it("prepends a new review with id and epoch-second savedAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1700000000 * 1000));
    const { useJournal } = await loadStore();
    useJournal.getState().saveReview({ key: "2026-10-20", period: "daily", text: "first" });
    const [review] = useJournal.getState().savedReviews;
    expect(review).toMatchObject({ key: "2026-10-20", period: "daily", text: "first", savedAt: 1700000000 });
    expect(review?.id.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("replaces by key + period, keeping the id; other periods untouched", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().saveReview({ key: "2026-10-20", period: "daily", text: "v1" });
    useJournal.getState().saveReview({ key: "2026-10-20", period: "weekly", text: "week" });
    const dailyId = useJournal.getState().savedReviews.find((r) => r.period === "daily")?.id;

    useJournal.getState().saveReview({ key: "2026-10-20", period: "daily", text: "v2" });
    const reviews = useJournal.getState().savedReviews;
    expect(reviews).toHaveLength(2);
    const daily = reviews.find((r) => r.period === "daily");
    expect(daily?.text).toBe("v2");
    expect(daily?.id).toBe(dailyId);
  });

  it("caps new prepends at 200 on write so a reload keeps every saved review", async () => {
    const { useJournal } = await loadStore();
    for (let i = 0; i < 205; i++) {
      useJournal.getState().saveReview({ key: `k${i}`, period: "daily", text: `t${i}` });
    }
    const live = useJournal.getState().savedReviews;
    expect(live).toHaveLength(200);
    expect(live[0]?.key).toBe("k204"); // newest first
    expect(live[199]?.key).toBe("k5"); // oldest kept
    expect((persisted().savedReviews as unknown[]).length).toBe(200);

    const reloaded = await loadStore();
    const restored = reloaded.useJournal.getState().savedReviews;
    expect(restored).toHaveLength(200);
    expect(restored[0]?.key).toBe("k204");
  });

  it("a replace at the cap updates in place and is never dropped", async () => {
    const { useJournal } = await loadStore();
    for (let i = 0; i < 200; i++) {
      useJournal.getState().saveReview({ key: `k${i}`, period: "daily", text: `t${i}` });
    }
    const target = useJournal.getState().savedReviews.find((r) => r.key === "k199");
    expect(target).toBeDefined();

    useJournal.getState().saveReview({ key: "k199", period: "daily", text: "replaced" });
    const after = useJournal.getState().savedReviews;
    expect(after).toHaveLength(200);
    const updated = after.find((r) => r.key === "k199");
    expect(updated).toMatchObject({ id: target?.id, text: "replaced" });
    expect((persisted().savedReviews as Array<{ text: string }>).find((r) => r.text === "replaced")).toBeDefined();
  });

  it("removeReview drops only the matching id", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().saveReview({ key: "2026-10-20", period: "daily", text: "a" });
    useJournal.getState().saveReview({ key: "2026-10-21", period: "daily", text: "b" });
    const keep = useJournal.getState().savedReviews.find((r) => r.key === "2026-10-21");
    useJournal.getState().removeReview(keep?.id ?? "missing");
    expect(useJournal.getState().savedReviews.map((r) => r.key)).toEqual(["2026-10-20"]);
  });
});

describe("toggleRule", () => {
  it("flips the indexed rule and persists", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().addEntry(withRules());
    const id = useJournal.getState().entries[0]?.id ?? "";

    useJournal.getState().toggleRule(id, 0);
    expect(useJournal.getState().entries[0]?.rules?.[0]?.done).toBe(true);
    expect(useJournal.getState().entries[0]?.rules?.[1]?.done).toBe(true); // untouched

    useJournal.getState().toggleRule(id, 0);
    expect(useJournal.getState().entries[0]?.rules?.[0]?.done).toBe(false);

    const stored = (persisted().entries as JournalEntry[])[0];
    expect(stored?.rules?.[0]?.done).toBe(false);
  });

  it("no-ops on a missing entry or index", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().addEntry(withRules());
    const before = useJournal.getState().entries;

    useJournal.getState().toggleRule("nope", 0);
    useJournal.getState().toggleRule(before[0]?.id ?? "", 99);
    useJournal.getState().toggleRule(before[0]?.id ?? "", -1);
    expect(useJournal.getState().entries).toEqual(before);
  });
});

describe("propFirm", () => {
  it("shallow-merges patches and persists", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().setPropFirm({ dailyLossLimit: 500 });
    useJournal.getState().setPropFirm({ maxDrawdownLimit: 1000 });
    expect(useJournal.getState().propFirm).toEqual({ dailyLossLimit: 500, maxDrawdownLimit: 1000 });
    expect(persisted().propFirm).toEqual({ dailyLossLimit: 500, maxDrawdownLimit: 1000 });
  });

  it("clears a field passed as undefined; JSON omits it", async () => {
    const { useJournal } = await loadStore();
    useJournal.getState().setPropFirm({ dailyLossLimit: 500, maxDrawdownLimit: 1000 });
    useJournal.getState().setPropFirm({ dailyLossLimit: undefined });
    expect(useJournal.getState().propFirm).toEqual({ maxDrawdownLimit: 1000 });
    expect(persisted().propFirm).toEqual({ maxDrawdownLimit: 1000 });
  });
});

describe("clear", () => {
  it("resets entries, notes, reviews and prop-firm limits", async () => {
    const { useJournal } = await loadStore();
    const s = useJournal.getState();
    s.addEntry(entry());
    s.addNote({ time: 1, text: "note" });
    s.saveReview({ key: "2026-10-20", period: "daily", text: "r" });
    s.setPropFirm({ dailyLossLimit: 100 });
    s.addPlan({ symbol: "EURUSD", side: "long" });

    useJournal.getState().clear();
    const after = useJournal.getState();
    expect(after.entries).toEqual([]);
    expect(after.notes).toEqual([]);
    expect(after.savedReviews).toEqual([]);
    expect(after.propFirm).toEqual({});
    expect(after.plans).toEqual([]);
    expect(persisted()).toMatchObject({ entries: [], notes: [], savedReviews: [], propFirm: {}, plans: [] });
  });
});

describe("pre-trade plans", () => {
  it("adds, updates and removes a plan and survives a reload", async () => {
    const first = await loadStore();
    first.useJournal.getState().addPlan({
      symbol: "eurusd",
      side: "long",
      entry: 1.1,
      stop: 1.09,
      target: 1.13,
      thesis: "breakout",
    });
    const plan = first.useJournal.getState().plans[0]!;
    expect(plan).toMatchObject({ symbol: "eurusd", side: "long", status: "planned" });

    first.useJournal.getState().updatePlan(plan.id, { status: "executed" });
    expect(first.useJournal.getState().plans[0]?.status).toBe("executed");
    first.flushJournal();

    const second = await loadStore();
    expect(second.useJournal.getState().plans[0]).toMatchObject({ symbol: "eurusd", status: "executed" });

    second.useJournal.getState().removePlan(plan.id);
    expect(second.useJournal.getState().plans).toEqual([]);
  });

  it("drops malformed plan rows and keeps valid ones", async () => {
    h.storage.set(
      KEY,
      JSON.stringify({
        entries: [],
        notes: [],
        plans: [
          { id: "p1", symbol: "XAUUSD", side: "short", createdAt: 5, status: "missed" },
          { id: 42, symbol: "BAD", side: "long", createdAt: 5, status: "planned" },
          { id: "p2", symbol: "BAD", side: "sideways", createdAt: 5, status: "planned" },
          { id: "p3", symbol: "BAD", side: "long", createdAt: 5, status: "unknown" },
        ],
      }),
    );
    const { useJournal } = await loadStore();
    expect(useJournal.getState().plans).toEqual([
      { id: "p1", symbol: "XAUUSD", side: "short", createdAt: 5, status: "missed" },
    ]);
  });
});

describe("storageIssue", () => {
  it("flags the session when a save is refused by quota, and clears on dismiss", async () => {
    const { useJournal } = await loadStore();
    expect(useJournal.getState().storageIssue).toBe(false);

    // Quota exceeded: every write now throws.
    const g = globalThis as Record<string, unknown>;
    const setItem = g.localStorage as { setItem: (k: string, v: string) => void };
    setItem.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    useJournal.getState().addNote({ time: 5, text: "will not fit" });
    current?.flushJournal();
    expect(useJournal.getState().storageIssue).toBe(true);

    useJournal.getState().dismissStorageIssue();
    expect(useJournal.getState().storageIssue).toBe(false);
  });
});

describe("captureChart", () => {
  // Phase 8 extracted the compositor into chartImage.ts; the delegate must
  // keep the node-safe behaviour: no document, no snapshot, never a throw.
  it("returns null in node instead of throwing", async () => {
    const { captureChart } = await loadStore();
    expect(typeof document).toBe("undefined");
    expect(captureChart()).toBeNull();
  });
});
