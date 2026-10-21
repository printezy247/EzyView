# Phase 6 — Fundamentals Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundamentals reaches MASTERPLAN Phase 6 depth: calendar filters (impact + currency + search + date range), news search, and fundamental overlays on the price chart (earnings markers, macro event vertical lines).

**Architecture:** Pure filter/overlay mapping helpers live in `packages/fundamentals` with unit tests. The existing `FundamentalsPanel.tsx` (all 7 tabs already ship) gains filter UI and is slimmed by extracting the calendar/news/earnings tabs. Chart overlays flow through a new `setFundamentalEvents` channel on `packages/chart-engine`'s `ChartHost` (separate from script `plotshape` markers so scripts and fundamentals never clobber each other), wired from the chart toolbar.

**Tech Stack:** TypeScript, Lightweight Charts v5 `createSeriesMarkers`, custom pane primitive for vertical lines, Vitest, Tailwind tokens already in `styles.css`.

**Spec:** `MASTERPLAN.md` §3.3 and `docs/MEGA-PLAN.md` Phase 6.

## Global Constraints

- Secrets stay in the OS keyring; fundamentals stays adapter-driven (demo/offline sources must keep working with zero API keys).
- All gates per task: `npm run lint`, `npm run typecheck`, `npx vitest run --configLoader runner`. Full `npm run build:web` at phase end.
- Times are epoch **seconds** (existing `EpochSeconds` convention) in domain code; LWC marker `time` casts to `UTCTimestamp` at the host boundary only.
- No new npm dependencies.

## Review Focus

- Marker channel isolation: `setFundamentalEvents` must merge with, not replace, script `plotshape` markers; toggling fundamentals off must leave script markers intact, and vice versa.
- Chart-type switch: `host.ts` rebuilds series and drops markers (existing comment around line 859) — fundamental markers and event lines must survive or be re-applied after rebuild.
- Calendar filter interactions: impact + currency + search + date range compose (AND), empty result shows the existing empty state, not a blank table.
- Vertical lines: must not enter the undo stack or export as user drawings; off-screen events render nothing (no crash on out-of-range times).

## Tasks

### Task 1: Filter + overlay domain helpers
**Files:**
- Create: `packages/fundamentals/src/overlay.ts`, `packages/fundamentals/src/overlay.test.ts`
- Modify: `packages/fundamentals/src/index.ts` (barrel exports)

**Interfaces:**
- Produces (Task 2/3 consume):
  - `filterEvents(events: readonly EconomicEvent[], opts: { impact?: Impact | "all"; currency?: string; search?: string; from?: EpochSeconds; to?: EpochSeconds }): EconomicEvent[]` — AND semantics; `impact: "all"`/omitted = no impact filtering; currency case-insensitive exact match; search case-insensitive substring over `title` and `currency`; `from` inclusive, `to` exclusive on `event.time`; input never mutated.
  - `filterNews(items: readonly NewsItem[], search: string): NewsItem[]` — case-insensitive substring over `headline` and `summary`; empty/whitespace search returns input as-is.
  - `interface FundamentalMarker { time: EpochSeconds; title: string; kind: "earnings" | "event"; impact?: Impact }`
  - `fundamentalOverlays(earnings: readonly EarningsReport[], events: readonly EconomicEvent[], opts: { minImpact?: Impact; now?: EpochSeconds }): { markers: FundamentalMarker[]; lines: number[] }` — earnings → `kind:"earnings"` markers (only entries with a finite `time`); economic events with `impact` at or above `minImpact` (default `"high"`) → marker `kind:"event"` AND pushed to `lines`; result deduped by (`time`,`title`), sorted ascending by time. `now` reserved for future date filtering (pass-through, unused in v1 — document, do not lint away).

- [ ] Step 1: Write `overlay.test.ts` first (failing): filter composition (impact+currency+search+range AND), search case-insensitivity, filterNews empty-search identity, overlays earnings-only, overlays default minImpact high (medium event excluded), lines sorted+deduped, input arrays not mutated.
- [ ] Step 2: Run `npx vitest run --configLoader runner packages/fundamentals/src/overlay.test.ts` — FAIL (module not found).
- [ ] Step 3: Implement `overlay.ts` + barrel exports.
- [ ] Step 4: Tests pass; `npm run lint` + `npm run typecheck` clean.
- [ ] Step 5: Commit `feat(fundamentals): calendar/news filters + overlay mapping`.

### Task 2: Panel filter UI + tab extraction
**Files:**
- Create: `apps/desktop/src/FundamentalsTabs.tsx` (Calendar/News/Earnings tabs moved out)
- Modify: `apps/desktop/src/FundamentalsPanel.tsx` (imports moved tabs; slims below 300 lines)
- Test: `apps/desktop/src/fundamentalsFilters.test.ts` if any new non-JSX helper logic is added (e.g. currency list builder) — otherwise skip with justification in report.

**Interfaces:**
- Consumes: `filterEvents`, `filterNews` from Task 1; existing `useLoad`, `src.sources.calendar.getCalendar(from, to)`, `src.sources.news.getNews`.
- Produces: none new (UI only).

- [ ] Step 1: Extract `CalendarTab`, `NewsTab`, `EarningsTab` (+ their private helpers `useLoad`, `when`, `tone`, `safeHref`, `IMPACT_COLOR`, `Failed`, `Empty`, `tickerOf` — move ONLY what the three tabs need; `IposTab`/`DivididendsTab`/`ScreenerTab`/`HeatmapTab` stay in panel if they share nothing, or move wholesale if imports get tangled — implementer's call, report which).
- [ ] Step 2: CalendarTab gains: currency `<select>` (distinct currencies present in loaded events + "all"), search `<input placeholder="Search events">`, date-range `<input type="date">` pair (defaults = the currently fetched window `now-1d..now+7d`); all three AND with the existing impact select via `filterEvents`. Widen the fetch window to `now - 7d .. now + 30d` so the date pair has range to play in.
- [ ] Step 3: NewsTab gains a search `<input>` wired through `filterNews`; show `N of M` count when filtering.
- [ ] Step 4: Gates (lint/typecheck/full vitest) clean; `FundamentalsPanel.tsx` under 350 lines.
- [ ] Step 5: Commit `feat(fundamentals): calendar currency/search/date filters, news search`.

### Task 3: Chart overlays (markers + event lines)
**Files:**
- Modify: `packages/chart-engine/src/host.ts` (new channel), tests if host logic is unit-testable in isolation (markers/line primitive data prep — extract a pure helper and test it in `packages/chart-engine/src/`), `apps/desktop/src/Toolbar.tsx` or `ChartPage.tsx` (toggle + fetch), possibly `apps/desktop/src/fundamentalEvents.test.ts`.

**Interfaces:**
- Consumes: `fundamentalOverlays` (Task 1); `ChartHost` existing `markerLayer`/`applyMarkers`/`resetMarkers` machinery; `src.sources.calendar.getCalendar`, `src.sources.earnings.getEarnings`.
- Produces:
  - `ChartHost.setFundamentalEvents(overlays: { markers: FundamentalMarker[]; lines: number[] }): void` — merges fundamental markers into a SEPARATE list from script markers; `applyMarkers()` composites both (sorted by time) and re-applies. Clears previous fundamentals state (both lists) each call; empty overlays = pure cleanup.
  - Vertical lines: full-pane-height dashed lines at `lines` times, impact-coloured (high → red, medium → amber), drawn by a pane primitive attached like `bgBands`/`drawings`; NOT registered as drawings (no undo, no export). Re-applied after chart-type series rebuild (same hook that re-applies markers today).
  - Toolbar: toggle button "Events" (default ON) — on enable/symbol change fetches `getCalendar(now-60d, now+60d)` + `getEarnings(symbol)` and calls `setFundamentalEvents(fundamentalOverlays(...))`; on disable calls `setFundamentalEvents({markers:[],lines:[]})`. Fetch failures degrade to empty overlay (no toast).

- [ ] Step 1: Pure helper + tests for composite marker merge (script markers ∪ fundamental markers sorted, fundamentals cleared without touching script list) — failing test first.
- [ ] Step 2: `setFundamentalEvents` + line primitive in `host.ts`; survive chart-type rebuild.
- [ ] Step 3: Toolbar toggle + fetch wiring in `ChartPage`/`Toolbar`.
- [ ] Step 4: Gates clean; no new deps.
- [ ] Step 5: Commit `feat(chart): fundamental event markers + macro vertical lines`.

### Task 4: Gates + docs
- Full gates: `npm run lint`, `npm run typecheck`, `npx vitest run --configLoader runner`, `npm run build:web`.
- MASTERPLAN: §7 row 6 → **done (PR #16)**; §8 add Phase 6 closed line; §12 Phase 6 → Done with deviations; known-gaps line refresh.
- (Controller runs git usual ops separately.)
