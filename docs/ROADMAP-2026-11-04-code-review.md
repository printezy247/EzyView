# EzyView Code Review — Fixes & Upgrades Roadmap

> Date: 2026-11-04 · Scope: EzyView v0.4.0 (`apps/desktop` ~38k lines + 12 packages) · Baseline: `tsc --noEmit` clean, `oxlint` clean, `vitest run` = 125 files / 1221 tests / 0 fail.

## Context

Full review of EzyView via three parallel audits (desktop architecture, core packages, tooling/CI/docs). This document lists every fix and upgrade found, grouped into phases ordered by risk: safety → correctness → performance → architecture → accessibility/UI → docs/CI → new capability.

Pine interpreter rewrite (removing CSP `unsafe-eval`) is **deferred** — only hardening ships in this roadmap.

**Sizing:** S = <1h · M = half-day · L = 1–2 days · XL = multiple days.
**Flow:** every task = failing test first (TDD), own commit; one PR per phase-section; merge only when CI is green.

---

## Phase 0 — Safety & Security (first; small diffs, high stakes)

| # | Task | Files | Size | Depends |
|---|---|---|---|---|
| 0.1 | Conservative `DEFAULT_SAFETY`: `maxDailyLossPct` 0 → 5, `lossCooldownSeconds` 0 → 60; surface allow-list as first-run recommendation in Settings → Brokers | `apps/desktop/src/tradingSafety.ts:27-33`, `SettingsPage.tsx`, `tradingSafety.test.ts` | S | — |
| 0.2 | Paper orders through `gateAction` (currently bypassed at `apps/desktop/src/trading.ts:197-200`); gate's dry-run note applies to paper | `trading.ts`, `trading.gate.test.ts` | S | 0.1 |
| 0.3 | Fail closed in `realSourceKey` (`App.tsx:475-483`): transport error → treat as real/unknown and require confirmation; never silently demote a real feed to demo | `App.tsx`, `nav.test.ts` | S | — |
| 0.4 | `Mt5Setup`: catch all connect errors, not just `RiskRequiredError` (`Mt5Setup.tsx:133-134`); stop discarding `addAccount` failures (`:128`) | `Mt5Setup.tsx`, `mt5Accounts.ts` | S | — |
| 0.5 | Pine hardening: regression tests for sandbox globals (`packages/pine-transpiler/src/transpile.ts:539-595`, `evaluate.ts:41-85`); `docs/SECURITY.md` documenting the `unsafe-eval` risk plus worker/budget mitigations | `pine.test.ts`, `docs/SECURITY.md` (new) | M | — |

**PR:** `fix(safety): phase 0 safety hardening` (0.1–0.5).
**Acceptance:** new tests green; manual — paper order over volume cap rejected; kill the quote feed → UI asks for confirmation instead of silently treating the source as demo.

## Phase 1 — Correctness Bugs

| # | Task | Files | Size | Depends |
|---|---|---|---|---|
| 1.1 | Feed-failure status in the UI: per-source failure flag from the `CircuitBreaker` (`apps/desktop/src/data.ts:152`) shown in Watchlist / Screener / QuoteHeader — stale prices must not look live. DepthOfMarket already does this (`status === "failed"`); reuse the pattern | `data.ts:385-392`, `Watchlist.tsx`, `ScreenerTab.tsx:42`, `QuoteHeader.tsx` | M | — |
| 1.2 | Wire the dead `withRetry` (`apps/desktop/src/netRetry.ts`) into fundamentals HTTP and public quote/history fetches; 429 → backoff instead of hard error | `packages/fundamentals/src/http.ts:37-40`, `data.ts` | M | — |
| 1.3 | Log the questionable subset of ~97 no-log catches: `shareLink`, `nav`, `links`, `workspaceBackup`, `snapshot:81`, `pineRunner:97`, `ChartHost:715`, `mt5.ts:49-60` → route to the `diagnostics` channel; leave intentional localStorage fallbacks alone | listed files, `diagnostics.ts` | M | — |
| 1.4 | Persist quota failure → one-time `notice` (`store.ts:466-510`) | `store.ts`, `store.test.ts` | S | — |
| 1.5 | Fix stale Yahoo comment (`packages/data-adapters/src/types.ts:110` vs `liveFeeds.ts:24`) | `types.ts` | S | — |
| 1.6 | Notification policy: mount `Toaster` (`apps/desktop/src/ui/Toast.tsx` is dead, zero callers) and migrate, or delete the dead export; document policy — blocking (`notice.alert`) vs inline `set({ error })` vs silent fallback | `ui/index.ts`, `NoticeHost.tsx`, `notice.ts` | M | — |

**PRs:** `fix(feed): surface quote failures` (1.1–1.2), `fix(robustness): catch logging, quota notice, policy` (1.3–1.6).
**Acceptance:** kill a provider → Watchlist shows a stale/failure marker; AlphaVantage 429 retries; no bare parse-failure catches remain in the listed files.

## Phase 2 — Performance

| # | Task | Files | Size | Depends |
|---|---|---|---|---|
| 2.1 | Incremental live updates: `series.update()` for the forming bar instead of full-series `setData` (`ChartHost.tsx:884-907` → `packages/chart-engine/src/host.ts:421-430`); indicator cache (`host.ts:971-978`) keyed on closed-bar identity rather than last-bar | `ChartHost.tsx`, `chart-engine/src/host.ts`, `host.*.test.ts` | L | — |
| 2.2 | Virtualize lists via `@tanstack/react-virtual`: journal and screener first (largest data), then alerts and watchlist | `JournalPanel.tsx:382`, `ScreenerTab.tsx:167`, `AlertsPage.tsx:93`, `Watchlist.tsx:326` | M | — |
| 2.3 | Re-render hygiene: Toolbar reads `useWorkspace` selectors itself and App passes only shell callbacks (kills 44 props + ~30 inline arrows, `App.tsx:235-270`, `Toolbar.tsx:93-144`); `ChartMenuHost.tsx:65` narrow selector; `React.memo` on `WatchRow` and journal/alert rows | `App.tsx`, `Toolbar.tsx`, `ChartMenuHost.tsx`, `Watchlist.tsx` | M | — |
| 2.4 | (Optional, after 2.1–2.3 land) incremental pane reconcile instead of full teardown on overlay change (`chart-engine/src/host.ts:793-844`) | `chart-engine/src/host.ts` | L | 2.1 |

**PRs:** `perf(chart): incremental tick updates` (2.1), `perf(ui): virtualize lists + memo` (2.2–2.3), optional (2.4).
**Acceptance:** `npm run bench:indicators` before/after numbers in the PR body; manual — live tick on a 1Y daily chart shows a CPU drop; scrolling 5k journal rows stays smooth.

## Phase 3 — Architecture Refactors (behavior-preserving, tests first)

| # | Task | Files | Size | Depends |
|---|---|---|---|---|
| 3.1 | God-store split: extract slices along persist boundaries — alerts, watchlist, Pine scripts + versions, chart templates, drawing undo stacks (`store.ts:191-399`, `partialize:1538-1556`, `MAX_DRAWING_UNDO:115`); keep layouts/drawings core; update the 40 importers mechanically | `store.ts` (1771 lines) → `store/*.ts`, 40 consumers, `store.test.ts` (633) | XL | Phase 2 merged |
| 3.2 | `ChartSettingsDialog`: 7 inline tab panels (`:156/345/540/708/940/1062/1134`) → one file per tab using kit `Tabs`/`Field`; 54 raw inputs → kit inputs | `ChartSettingsDialog.tsx` (1238) → `settings-tabs/*` | L | 4.1 |
| 3.3 | `ChartHost` split: data-subscription effects / drawing-gesture controller / engine prop-sync (gesture logic stays pure in `packages/drawing-tools` per `docs/ARCHITECTURE.md`) | `ChartHost.tsx` (1345) | L | 2.1 |
| 3.4 | `PineEditor` split: Monaco language + theme (`:997-1147`), StrategyTester (`:712`), EquityCurve (`:870`), OptimizePanel (`:558`) to files | `PineEditor.tsx` (1147) | M | — |
| 3.5 | `ChartPage`: extract `ChartGrid` (`:611`) and dock composition; page stays the router target | `ChartPage.tsx` (1101) | M | — |
| 3.6 | `App`/`Toolbar`: extract `SourceToggle` (`App.tsx:489`), `FeedStatus` (`:621`), risk dialogs (`:556`, `:592`); extract `buildExportEntries` (`Toolbar.tsx:175`) and menu builders | `App.tsx`, `Toolbar.tsx` | M | 2.3 |
| 3.7 | chart-engine tests alongside the splits: lifecycle/reconcile for `host.ts` (1433 lines, only the click test today), hit-test/geometry for `drawings.ts` (1004, untested); target ≥50% package line ratio (currently 18%) | `packages/chart-engine/src/*.test.ts` | L | 3.2, 3.3 |

**PRs:** one per row (3.1 after Phase 2 merges).
**Acceptance:** zero behavior change — full vitest + e2e smoke green per PR; store slices persist independently; `docs/ui-audit.md` counts unaffected.

## Phase 4 — Accessibility & UI-Kit Migration

Follow the order in `docs/ui-audit.md`. Baseline: 279 raw `<button>`, 161 raw `<input>`, kit imported by only 33 files; raw `<Modal>` ×12 vs kit `<Dialog>` ×2.

| # | Task | Files | Size | Depends |
|---|---|---|---|---|
| 4.1 | Kit gap-fill: Field number input (needed for `ChartSettingsDialog`'s 54 inputs) | `apps/desktop/src/ui/Field.tsx`, `ui/kit.test.tsx` | S | — |
| 4.2 | Toolbar and chart chrome: `DrawingToolbar.tsx` (19 buttons, no kit), `TabBar.tsx` (10), `FloatingDrawingBar.tsx` (11), `App.tsx` (10), `TradingPanel.tsx` (11) | listed | M | 4.1 |
| 4.3 | Migrate the 12 raw `<Modal>` call sites → kit `Dialog` (ApiKeys, TradeConfirm, ChartSettings, DrawingSettings, Indicator, JournalEntry, Compare, Hotkey, BarsTable, Alert, TemplateName, NoticeHost); add background `inert` + body scroll lock to `Modal.tsx` | `Modal.tsx`, 12 dialogs | L | — |
| 4.4 | Keyboard/a11y: ChartSettings tabs arrow-key roving (`:125-155`); `FloatingDrawingBar.tsx:257` Escape + focus trap; `ObjectTree.tsx` tree/list roles (19 buttons); icon-only buttons get `aria-label`, not just `title` (TradingPanel, TabBar) | listed | M | 4.2 |
| 4.5 | Remaining forms/docks/pages per the `docs/ui-audit.md` per-file table: `ObjectTree`, `JournalPanel`, `SettingsPage`, `OrderTicket`, `Watchlist`, … | see audit table | L | 4.2–4.4 |
| 4.6 | Re-run `node scripts/ui-audit.mjs` after each batch; done = no raw control the kit can express | script output | S | each batch |

**PRs:** 4.1+4.2, then 4.3+4.4, then 4.5 in audit migration order.
**Acceptance:** audit counts drop each PR; keyboard-only pass (Tab/Escape/arrows) on every dialog; local visual e2e (`e2e/visual.spec.ts`) shows no regressions.

## Phase 5 — Docs, CI & Tooling

| # | Task | Files | Size | Depends |
|---|---|---|---|---|
| 5.1 | Docs truth pass: MEGA-PLAN marks Phases 0–9 shipped / archives (`docs/MEGA-PLAN.md:3,42-185,254` still says "planning only" and `pnpm`); README counts 1,240/175 → **1,221/125** (`README.md:3,83`); SETUP path `apps/mt5-bridge/` → `tools/mt5-bridge/`, deb `EzyView_0.1.0` → 0.4.0, add missing commands (`docs/SETUP.md:50,120,126`); ARCHITECTURE testing section (`:76-77`); `packaging/README.md` deb-files table missing mcp wrapper/man, LICENSE, NOTICE | `docs/*`, `README.md`, `packaging/README.md` | M | — |
| 5.2 | tsconfig tightening: add `noUnusedLocals` + `noUnusedParameters`; add path aliases `@ezyview/brand` (present in vitest, missing in tsconfig) and `@ezyview/mcp-server` (missing in both); include `e2e/` + `playwright.config.ts` in the root typecheck; fix the fallout | `tsconfig.base.json`, `tsconfig.json` | M | — |
| 5.3 | CI gates: add an `oxfmt --check` step; make `npm audit` fail on high+ (drop `\|\| true`, `.github/workflows/ci.yml:33`); add the mcp-server version (0.1.0) to `scripts/check-versions.mjs` | `ci.yml`, `release.yml`, `scripts/check-versions.mjs` | S | — |
| 5.4 | (Optional) Windows/macOS release artifacts — CI tests three OSes but `release.yml:74-78` ships Linux only | `release.yml` | L | 5.3 |

**PR:** `ci/docs: truth pass + gates`.
**Acceptance:** all CI jobs green including the new format/audit steps; `npm run check:versions` covers five version files; doc commands copy-paste and work.

## Phase 6 — Upgrades (by value; separate decisions)

| # | Task | Size |
|---|---|---|
| 6.1 | Shared candle cache in `packages/data-adapters` (move TTL + in-flight dedupe out of `apps/desktop/src/data.ts:431,382`) so mcp-server and other consumers stop re-fetching | M |
| 6.2 | Fundamentals provider circuit breaker — reuse `netRetry.ts` `CircuitBreaker` in `packages/fundamentals/src/http.ts` | S |
| 6.3 | Yahoo/equity adapter (the comment already promises it) — or leave the comment fixed per 1.5 | L |
| 6.4 | Visual e2e in CI (nightly or PR-label) — currently local-only by intent (`ci.yml:85-88`) | M |
| 6.5 | Per-package `scripts` (11 of 12 packages have none) for granular CI later | S |

**Deferred (documented, not scheduled):** Pine AST interpreter rewrite to drop CSP `unsafe-eval` (`packages/pine-transpiler/src/evaluate.ts:27,39-40`).

---

## Critical files

- `apps/desktop/src/store.ts`, `ChartHost.tsx`, `ChartSettingsDialog.tsx`, `App.tsx`, `Toolbar.tsx`, `tradingSafety.ts`, `trading.ts`, `data.ts`
- `packages/chart-engine/src/host.ts`, `packages/fundamentals/src/http.ts`, `packages/pine-transpiler/src/evaluate.ts`
- `.github/workflows/ci.yml`, `tsconfig.base.json`, `tsconfig.json`, `docs/*`, `README.md`

## Verification (per PR, before merge)

```bash
npm run lint
npm run typecheck
npm run test
npm run build:web
npx playwright test e2e/smoke.spec.ts
```

- Phase 0: new gate tests green; manual — over-cap paper order rejected; feed kill → confirmation dialog, not a silent demo.
- Phase 2: `npm run bench:indicators` numbers before/after in the PR body; manual live-tick CPU check.
- Phase 4: `node scripts/ui-audit.mjs` counts drop; keyboard-only dialog pass; local visual e2e run.
- Phase 5: all CI jobs green including the new gates; `npm run check:versions` passes.
- After the UI phases, run a Front-End Checklist (https://frontendchecklist.io) audit over the changed UI.
