# Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the findings in `docs/agent-architecture-audit-2026-10-21.md` in phased PRs, each merged via git ops, deferring only multi-week infra with reasons.

**Architecture:** Code-first fixes. Each phase is an independent, testable slice. Phase A removes the `new Function` sandbox escape; B persists alerts; C hardens MCP; D hardens MT5 bridge; E–J are smaller hardening/perf/test/DX/UX slices. Multi-week items (WebGL/OffscreenCanvas, signed updater keypair, co-editing, Pine v6 grammar, marketplace, macro world map) are deferred with reasons in §Deferred.

**Tech Stack:** TypeScript/React (Vite), Rust (Tauri v2), Python (mt5 bridge), Vitest, Playwright, oxlint/oxfmt.

**Spec:** `docs/agent-architecture-audit-2026-10-21.md` (the audit report).

## Global Constraints

- No paywalls; all features ship free.
- Packages (`packages/*`) never import React/DOM/Tauri; pure TS only.
- No `any` at package boundaries.
- Adapters degrade to false/null, never throw on health checks.
- Secrets in OS keyring only, never SQLite/logs/localStorage.
- TDD: failing test first, then code; run `npm run test` + `npm run typecheck` + `npm run lint` before commit.
- One PR per phase; merge only after CI green.
- Exact values from the audit: CSP `script-src 'self' 'unsafe-eval'` → `'self'`; partialize currently omits `alerts`/`alertHistory`/`watchlist`; bridge CORS `*`; bridge volume guard `volume <= 0` (NaN passes); max combos 500; snapshot 20 MB cap; alert history keep 200.

## Review Focus

- Pine scripts can escape the sandbox via globals/members (the headline security risk).
- Alert state lost on reload means price alerts never fire across sessions.
- Safety rails enforced only in renderer, not bridge (bypass by direct HTTP).
- MCP JSON-RPC envelope not validated (unhandled rejection on bad input).
- Hidden polling timers reset every 3–5s due to unstable effect deps.

## Phase A — Pine sandbox + CSP

### Task A1: Reject dangerous identifiers and members in the emitter

**Files:**
- Modify: `packages/pine-transpiler/src/transpile.ts` (`safeName`, `MemberExpr` handling)
- Test: `packages/pine-transpiler/src/pine.test.ts`

**Interfaces:**
- Consumes: existing `BUILTIN_NAMES` set, `Emitter.expr`.
- Produces: `PineUnsupportedError` thrown for unsafe identifiers/members.

- [ ] Step 1: Write failing tests: a script referencing `globalThis`, `window`, `fetch`, `constructor`, `__proto__`, `prototype` members must throw `PineUnsupportedError`.
- [ ] Step 2: Run tests; expect FAIL.
- [ ] Step 3: In `safeName`, reject names not in a Pine-allowed set (treat unknown as `__user_<name>` is current; instead throw for known-dangerous globals). In `MemberExpr`, reject `constructor`/`__proto__`/`prototype` and members not on a known namespace (`ta`, `math`, `color`, `shape`, `location`, `size`, `strategy`, `input`). Throw `PineUnsupportedError` with line/col.
- [ ] Step 4: Run tests; expect PASS.
- [ ] Step 5: Commit `fix(pine): reject dangerous globals and member access`.

### Task A2: Validate for-loop step != 0 and cap iterations

**Files:**
- Modify: `packages/pine-transpiler/src/transpile.ts` (`ForStmt` emitter)
- Modify: `packages/pine-transpiler/src/evaluate.ts` (runPine guard)
- Test: `packages/pine-transpiler/src/pine.test.ts`

- [ ] Step 1: Write failing test: `for i = 0 to 10 by 0` throws; a 100000-iteration loop throws.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Emitter: if step expr is a numeric literal 0, throw at transpile time. Wrap loop body counter with a max-iteration guard injected into emitted code (`let __iters = 0; ... if (++__iters > 100000) throw new Error("too many iterations")`). Also cap `close.length` input in runPine (reject > 10000 bars).
- [ ] Step 4: Run; expect PASS.
- [ ] Step 5: Commit.

### Task A3: Replace `new Function` with a sandboxed evaluator (worker or Function-with-shadowed globals)

**Files:**
- Modify: `packages/pine-transpiler/src/evaluate.ts` (runPine)
- Modify: `apps/desktop/src-tauri/tauri.conf.json` (CSP `script-src`)
- Test: `packages/pine-transpiler/src/pine.test.ts`

Note: full Worker isolation is multi-week; this task shadows globals inside the Function factory and removes `unsafe-eval` only after verifying tests pass. If tests require eval, keep CSP and document.

- [ ] Step 1: Write failing test: running a script that references `fetch` throws; `window` throws.
- [ ] Step 2: Run; expect FAIL (or PASS if A1 covers it).
- [ ] Step 3: In runPine factory, pass an empty-scope helpers object and ensure no globals leak: wrap body in `(function(){ "use strict"; ... })` with `globalThis` shadowed to `{}`. Remove `'unsafe-eval'` from CSP `script-src` → `'self'`. Run full pine test suite; if any test fails due to eval removal, revert CSP change and document deferral.
- [ ] Step 4: Run tests + typecheck + lint.
- [ ] Step 5: Commit.

## Phase B — Alert persistence

### Task B1: Persist alerts, alertHistory, watchlist

**Files:**
- Modify: `apps/desktop/src/store.ts` (partialize + merge)
- Test: `apps/desktop/src/store.test.ts`

- [ ] Step 1: Write failing test: after reload (rehydrate), alerts and watchlist survive.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Add `alerts`, `alertHistory`, `watchlist` to `partialize` and restore them in `merge` with guards.
- [ ] Step 4: Run; expect PASS.
- [ ] Step 5: Commit.

### Task B2: Re-arm once_per_bar alerts on new bar; pass barClosed from feed

**Files:**
- Modify: `packages/data-adapters/src/alerts.ts` (evaluateAlert: track bar time)
- Modify: `apps/desktop/src/alertFeed.ts` (detect bar boundary, pass barClosed)
- Test: `packages/data-adapters/src/alerts.test.ts`, `apps/desktop/src/alertFeed.test.ts` (if exists)

- [ ] Step 1: Write failing test: a `once_per_bar` alert fires, then on a new bar (different candle.time period) re-arms and can fire again; `once_per_bar_close` fires only when barClosed true.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Add `barTime`/`lastBarTime` tracking to evaluateAlert; re-arm when candle.time crosses a period boundary. In alertFeed, compute barClosed by comparing quote time to last seen period; pass it.
- [ ] Step 4: Run; expect PASS.
- [ ] Step 5: Commit.

### Task B3: Fix Watchlist/Heatmap/Screener interval reset (stable deps)

**Files:**
- Modify: `apps/desktop/src/Watchlist.tsx`, `HeatmapTab.tsx`, `ScreenerTab.tsx`
- Test: existing component tests

- [ ] Step 1: Write failing test (or note): effect does not restart when watchlist array identity changes but symbol set same.
- [ ] Step 2: Run.
- [ ] Step 3: Change effect deps from `watchlist` array to a stable string key `watchlist.map(w=>w.symbol).join(",")`.
- [ ] Step 4: Run; expect PASS.
- [ ] Step 5: Commit.

### Task B4: Store alertFeed disposer; add tick timeout; evict tape buffers; throttle crosshair

**Files:**
- Modify: `apps/desktop/src/main.tsx`, `apps/desktop/src/alertFeed.ts`, `apps/desktop/src/tapeStore.ts`, `apps/desktop/src/crosshairBus.ts`
- Test: component/store tests

- [ ] Step 1: Write failing tests for: disposer clears interval; tape map evicts; crosshair throttle.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Store disposer in main.tsx and call on unmount; add AbortController/timeout to tick; add LRU eviction (cap 50 symbols) to tapeStore; throttle publishCrosshair via rAF.
- [ ] Step 4: Run; expect PASS.
- [ ] Step 5: Commit.

## Phase C — MCP envelope + snapshot retry

### Task C1: Validate JSON-RPC envelope; wrap dispatch; cap line length; handle write errors

**Files:**
- Modify: `packages/mcp-server/src/stdio.ts`, `packages/mcp-server/src/server.ts` (handleMessage guard)
- Test: `packages/mcp-server/src/server.test.ts`

- [ ] Step 1: Write failing tests: primitive/array/null msg → -32600 or ignored; line > 1MB ignored.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: In handleMessage, validate msg is non-null object with string method; return invalid-request error or null for notification. In stdio, cap line length (e.g. 1 MB) and ignore oversized; handle stdout write errors; exit on stdin close.
- [ ] Step 4: Run; expect PASS.
- [ ] Step 5: Commit.

### Task C2: journal_review_pack hostile-row guards; input validation; snapshot retry + age

**Files:**
- Modify: `packages/mcp-server/src/server.ts` (journal_review_pack, price_option, option_chain, screen, economic_calendar, str cap)
- Modify: `packages/mcp-server/src/snapshot.ts` (empty env fallback, ENOENT-only message)
- Modify: `apps/desktop/src/snapshot.ts` (retry with backoff)
- Test: server.test.ts, workspace.test.ts, snapshot.test.ts

- [ ] Step 1: Write failing tests for hostile rows, non-positive days/vol/rate, empty env, missing vs permission error.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Add null/shape guards for entries and notes in journal_review_pack; validate positivity/ranges/enums and cap str length; use truthiness fallbacks for env; distinguish ENOENT; retry failed writes with backoff; surface updatedAt age in get_workspace.
- [ ] Step 4: Run; expect PASS.
- [ ] Step 5: Commit.

## Phase D — MT5 bridge hardening

### Task D1: Bridge token + restrict CORS + rate limit

**Files:**
- Modify: `tools/mt5-bridge/bridge.py`
- Test: `tools/mt5-bridge/test_bridge.py` (create if missing)

- [ ] Step 1: Write failing tests (Python) for: missing token → 401; CORS not `*`; rate limit.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Generate per-launch token (uuid4) printed to stdout; require `X-Bridge-Token` on every request; restrict CORS to Tauri origin or drop; add simple per-IP throttle.
- [ ] Step 4: Run; expect PASS.
- [ ] Step 5: Commit.

### Task D2: Server-side rails + NaN/Inf volume + account kind + close-all + HTTPS MCP + timeouts + 401 clear

**Files:**
- Modify: `tools/mt5-bridge/bridge.py` (_order, _close, _connect)
- Modify: `apps/desktop/src/trading.ts` (close-all gate)
- Modify: `packages/mt5-adapter/src/mcp.ts` (HTTPS check, timeout, session reset)
- Modify: `apps/desktop/src/mt5Accounts.ts` (accountKindOf uses tradeMode)
- Test: adapter tests, mt5Accounts tests

- [ ] Step 1: Write failing tests.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Enforce max volume + allow-list in bridge; reject non-finite volume via math.isfinite; derive account kind from broker tradeMode; gate close-all per row or aggregate; require HTTPS for non-localhost MCP URLs (warn/refuse); add AbortController timeout; clear session on 401 and reconnect.
- [ ] Step 4: Run; expect PASS.
- [ ] Step 5: Commit.

## Phase E — Perf quick wins

### Task E1: Code-split Monaco + heavy panels; rAF batching for live candles

**Files:**
- Modify: `apps/desktop/src/PineEditor.tsx`, `apps/desktop/src/ChartHost.tsx`, `apps/desktop/src/liveBars.ts` (caller side)
- Test: build + existing tests

- [ ] Step 1: Lazy-load Monaco via React.lazy/Suspense (already partially). Batch chart updates via requestAnimationFrame in ChartHost live effect.
- [ ] Step 2: Run build + tests.
- [ ] Step 3: Commit.

## Phase F — Test infra

### Task F1: cargo test in CI; coverage; E2E journeys

**Files:**
- Modify: `.github/workflows/ci.yml`
- Add: `e2e/*.spec.ts` (drawing, paper order, alert trigger)
- Modify: `vitest.config.ts` (coverage)

- [ ] Step 1: Add `cargo test` to desktop job; add coverage step with threshold 70%; add E2E specs.
- [ ] Step 2: Run CI locally where possible.
- [ ] Step 3: Commit.

## Phase G — Feature quick wins

### Task G1: AI journal summary trigger (UI button calling MCP pack)

**Files:**
- Modify: `apps/desktop/src/JournalPage.tsx` or `JournalPanel.tsx`
- Test: component test

- [ ] Step 1: Add "Generate review" button that fetches journal_review_pack via MCP (or local data) and displays narrative placeholder.
- [ ] Step 2: Run tests.
- [ ] Step 3: Commit.

### Task G2: Multi-select drawings (shift/ctrl) + trend-line-angle alerts (deferred if too large)

Note: defer to next cycle if scope exceeds 1 PR; document reason.

## Phase H — Security hardening

### Task H1: SRI/integrity; lock connect-src; factory reset keyring policy; save_file size cap

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.conf.json`, `lib.rs` (factory_reset comment + optional wipe), `crosshairBus.ts`
- Test: Rust tests

- [ ] Step 1: Add size cap to save_file bytes (e.g. 50 MB); document factory reset leaves keyring secrets (or add "Clear keyring secrets" command). Lock connect-src wildcards to exact hosts. Add BroadcastChannel payload validation.
- [ ] Step 2: Run tests.
- [ ] Step 3: Commit.

## Phase I — DX/deploy

### Task I1: npm audit + cargo audit in CI; release tags

**Files:**
- Modify: `.github/workflows/ci.yml`
- Add: `.github/dependabot.yml`

- [ ] Step 1: Add audit steps; add dependabot config.
- [ ] Step 2: Commit.

## Phase J — UX/a11y

### Task J1: Sound controls + global shortcuts + a11y pass + i18n stub

**Files:**
- Modify: `apps/desktop/src/DesktopTab.tsx`, `apps/desktop/src/settings` (shortcuts), `apps/desktop/src/index.css` (focus rings)
- Add: `react-i18next` config stub

- [ ] Step 1: Add mute/volume/test for alerts; configurable global shortcuts; focus rings + aria labels; i18n provider stub (en only).
- [ ] Step 2: Run tests.
- [ ] Step 3: Commit.

## Deferred (with reasons)

- **Signed in-app updater** (tauri-plugin-updater + minisign keypair): needs a generated signing keypair and secret management; multi-week infra. Defer; notify-only updater stays.
- **WebGL/OffscreenCanvas** for 1M+ candles: large rendering rewrite; profile first. Defer.
- **Co-editing + cloud sync**: requires backend/collab service; multi-week. Defer.
- **Pine v6 grammar**: needs upstream pine-transpiler v6; not in repo. Defer.
- **Publish marketplace / macro world-map / tab monitor**: feature breadth; defer to next cycle.
- **Walk-forward optimization**: needs backtest engine changes; defer to Phase G follow-up.

## Execution order

A → B → C → D → E → F → G → H → I → J. Each phase: branch → implement → test → commit → push → PR → CI green → merge → sync main. Stop and report on any CI failure.
