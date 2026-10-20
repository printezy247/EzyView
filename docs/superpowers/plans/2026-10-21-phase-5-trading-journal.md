# Phase 5 — Trading Journal Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Journal reaches MASTERPLAN Phase 5 depth: manual trade entry with emotions/rules/screenshots, calendar heatmap, full stats (R-distribution, equity curve, by setup/tag/time-of-day), daily/weekly reviews with template summary, prop-firm limits, CSV export.

**Architecture:** Pure domain logic (model, stats, review composer, CSV) lives in `packages/journal` with unit tests. The desktop store (`apps/desktop/src/journal.ts`) persists new fields under the existing `ezyview.journal.v1` key with backward-compatible restore. `JournalPanel.tsx` gains a view-tab strip (Feed / Calendar / Stats / Reviews) plus a manual-entry dialog and a prop-firm status bar.

**Tech Stack:** TypeScript, Zustand, Vitest, Tailwind tokens already in `styles.css`.

**Spec:** `MASTERPLAN.md` §3.1 and `docs/MEGA-PLAN.md` Phase 5.

## Global Constraints

- Secrets stay in the OS keyring; journal data is localStorage only.
- All gates per task: `npm run lint`, `npm run typecheck`, `npx vitest run --configLoader runner`, `npm run build:web` at phase end.
- Entry times are epoch **seconds** (existing convention).
- Screenshots are data URLs, capped by existing MAX_ENTRIES/MAX_NOTES logic.

## Review Focus

- Backward compatibility: old persisted `ezyview.journal.v1` blobs without new fields must restore cleanly.
- R-multiple math: only closed trades with `plannedRisk > 0` count; sign conventions match `pnl`.
- Calendar heatmap: timezone — use local date strings from epoch seconds.
- CSV export: fields containing commas/quotes/newlines must round-trip.

## Tasks

### Task 1: Model + stats extensions
**Files:** `packages/journal/src/model.ts`, `stats.ts`, `stats.test.ts`
- `JournalEntry` adds `emotion?`, `rules?: Rule[]` (`{label, done}`), `stopPrice?`, `targetPrice?`.
- `JournalStats` adds `equitySeries: {time, equity}[]`, `rMultiples: number[]`, `rDistribution` (6 fixed buckets), `bySetup`, `byTag`, `byTimeOfDay` (Asia/London/Overlap/US by UTC entry hour).
- Tests for each new aggregator + empty behaviour.

### Task 2: Review composer
**Files:** `packages/journal/src/review.ts`, `review.test.ts`
- `composeReview(entries, notes, dayStart)` → deterministic template text: trade count, net, win rate, best/worst, rule adherence %, note count.
- `dateKey(epochSeconds)` → local `YYYY-MM-DD`.

### Task 3: Store + CSV
**Files:** `apps/desktop/src/journal.ts`, `journalCsv.ts` + `journalCsv.test.ts`
- Store: `addEntry`, `toggleRule`, reviews (`savedReviews: Review[]`, `saveReview`, `removeReview`), `propFirm: {dailyLossLimit?, maxDrawdownLimit?}` + `setPropFirm`, restore validation.
- `entriesToCsv(entries)` with RFC-4180 quoting.

### Task 4: UI
**Files:** `JournalPanel.tsx` (+ small `JournalCalendar.tsx`, `JournalStatsView.tsx` extracted for readability)
- View tabs: Feed (existing) / Calendar (month heatmap) / Stats (cards + SVG equity polyline + R histogram + breakdown tables) / Reviews (pick day, generate/edit/save).
- Manual entry dialog (symbol, side, qty, entry/exit price+time, SL/TP, fees, planned risk, setup, tags, emotion, rules textarea, rating, note, screenshot file).
- Prop-firm bar: daily net vs limit, max DD vs limit; warn colours on breach.
- CSV export button on the Feed header.

### Task 5: Gates + git ops
- Full gates, commit `feat: Phase 5 trading journal`, push (sandbox bypass), PR via GitHub MCP, CI green, merge, MASTERPLAN → done (PR #).
