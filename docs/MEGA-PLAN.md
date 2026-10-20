# EzyView Mega Plan — TradingView-Class Parity + MT5 Real-Account Trading

> Status: **research and planning only.** No source code changes in this phase.
> Owner: printezy247 · Date: 2026-10-20
> Sources: TradingView Desktop v3.4.1 extracted resources (`/tmp/claude-1000/tv-asar`), existing EzyView codebase, `MASTERPLAN.md`, `docs/*`, MT5 install under `~/.mt5`, MQL5 MT5-on-Linux article.

## 0. Executive Summary

EzyView already has a real chart engine (TradingView Lightweight Charts v5 + custom canvas primitives), a Pine transpiler, drawings, indicators, journal, fundamentals, options, an MT5 bridge, and an MCP server. What is missing relative to TradingView Desktop is not mostly *features* but *reliability of interaction* (drawing placement, editing, hit-testing), *navigation/information architecture* (everything crammed into one tab/panel stack), and *chart command ergonomics* (no quick symbol/timeframe input).

TradingView Desktop v3.4.1 is an Electron **shell** that hosts the web Supercharts app; charting, Pine, drawings, and alerts are server-side. Therefore EzyView keeps owning the engine and shell and lifts UX patterns from the extracted UI labels. The extracted `locales/en.json` yielded 367 UI labels covering tabs, tab groups, chart types, timeframes, drawings, alerts, layouts, hotlists, screener, news, chat, export, themes, and MCP.

Core problems to fix, in priority order:
1. Drawing placement is unreliable: click subscription → `ChartHost.onClick` → `snapToOhlc` → pending anchor state → `isComplete` has multiple failure points and no visual feedback for invalid clicks.
2. Drawings cannot be selected/edited after creation (no handles, drag, resize, delete-on-key, style, z-order, lock/hide).
3. No quick chart command control to type symbol/timeframe/pair.
4. All features (trading, journal, fundamentals, options) share one bottom panel slot; no dedicated routes/pages.
5. MT5 integration exists as a bridge but lacks an in-app real-account login flow, full order lifecycle UI, safety tokens, and audit log.
6. Journal lacks depth (screenshots, tags, emotions, rule checklist, stats, equity curve, R-distribution, reviews).
7. Fundamentals are minimal (calendar only) vs. news/screener/heatmaps/macro.

Locked decisions for this plan (from user):
- MT5 real-account login: in-app broker form (server/login/password) stored in the OS keyring, like MT5/TradingView settings. Demo-first with explicit real-account confirmation.
- Navigation: React Router routes + persistent shell (left rail, top toolbar, status bar).
- Quick chart command input: top-left overlay on the chart canvas, triggered by `Ctrl+K` or `/`.
- Git ops: after CI green, auto-merge the PR and report.

## 1. Architecture Decisions (Locked)

- One renderer process; pure logic in `packages/*` (per `docs/ARCHITECTURE.md`).
- Tauri v2 desktop, SQLite (sql.js) persistence, OS keyring for secrets (never SQLite for credentials).
- Adapter registry pattern (data, broker, fundamentals) with `I*Adapter` interfaces.
- No paywalls (TV gates saved-layout count and Pro features; EzyView does not).
- Drawing interaction must be testable as pure functions in `packages/drawing-tools` and `packages/chart-engine`, with React only translating DOM events.
- Navigation moves from boolean panel flags in `App.tsx` to a router with dedicated pages; panels become dockable widgets inside pages.
- Chart command input is a first-class primitive in `Toolbar`/`ChartHost`, not a panel.
- MT5 bridge runs in the Wine prefix under `~/.mt5`; the app talks to it over HTTP. Credentials live in the OS keyring, never in the bridge env or SQLite.
- Adapters degrade gracefully: health checks return `false`/`null` when unavailable; UI shows "disconnected" rather than crashing.

## 2. Phase Plan (priority order)

### Phase 0 — Drawing/Chart-Control Reliability (FIRST, blocks everything else)
Goal: make drawing placement deterministic and add quick chart switching. No new feature breadth.

Drawing placement reliability:
- `packages/chart-engine/src/host.ts` `EzyChart`:
  - Verify `subscribeClick` fires on every click; add a click-event counter and a `lastClick` debug field exposed to devtools.
  - `onClick` coordinate → price conversion must validate finite numbers; ignore clicks outside plot area with a toast/visual hint instead of silently dropping.
  - Add `screenToTimePrice(x, y)` returning `{ok, time, price, reason}` so callers can distinguish "outside chart" from "no data".
- `apps/desktop/src/ChartHost.tsx`:
  - Pending anchor state should render immediately as a "ghost" marker (dashed anchor) so the user sees the first point landed.
  - Completion (`isComplete`) must reset `pendingAnchor` and `activeTool` state in `finally`-style cleanup; add a `drawingInProgress` flag to prevent double-completion.
  - Add click debouncing/guard so a single physical click cannot create two anchors.
  - Surface errors via status bar ("Click inside chart area to place point").
- Snapping:
  - `snapToOhlc` should be a pure function in `packages/drawing-tools` with unit tests for OHLC snap, magnet off/on, and out-of-range.
  - Magnet cycle button in `DrawingToolbar` should persist mode per drawing tool and show current mode in tooltip.
- Undo/redo:
  - `store.ts` already has `undoLastDrawing`; add redo stack and `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z`.
- Hit-testing/editing prep:
  - `packages/drawing-tools/src/hitTest.ts` returns anchor handles + body; expose `hitTestAll` for multi-select later.

Chart command control:
- Add `ChartCommandInput` (top-left overlay in `ChartHost`):
  - Autocomplete symbol (from `list_symbols` / watchlist) and timeframe (`1m 5m 15m 30m 1h 4h 1d 1w 1M`).
  - Keyboard: `Ctrl+K` or `/` to focus; `Enter` to apply; `Esc` to cancel; arrow keys navigate.
  - Recent symbols list (persist in store/localStorage).
  - Slash commands: `/tf 1h`, `/sym AAPL`, `/layout 2`, `/indicator rsi`.
- Wire to `store` `setSymbol`/`setResolution` and chart reload.

Acceptance:
- 100 consecutive clicks inside chart area each create exactly one anchor; zero duplicate anchors.
- Switching symbol/timeframe via command input updates chart in <1s for cached data.
- Undo/redo restores drawing state byte-for-byte.

### Phase 1 — MT5 Real-Account Login Flow
Goal: let the user connect a real (or demo) MT5 account from inside EzyView, like MT5/TradingView settings, with safety rails.

Flow:
- Settings page `/settings` → "Brokers" section → "Add MT5 account" button.
- Modal form: Server (dropdown from bridge `GET /symbols`-adjacent server list or free text), Login (number), Password (masked), "Demo account" checkbox, "Save to keyring" toggle (default on).
- On submit: store credentials in OS keyring keyed by `(server, login)`; never write to SQLite or logs; password field cleared from React state after submit.
- Connect: app calls bridge `POST /connect` (or equivalent) with credentials fetched from keyring; bridge returns account info; app stores a session token (in-memory only) and marks bridge status "connected".
- Account panel shows: balance, equity, margin, free margin, P&L, leverage, server, login (masked except last 4).
- Disconnect: clears session token; credentials remain in keyring unless user chooses "Forget account".
- Demo vs real: default to demo; switching to real requires a confirmation dialog listing risk warnings and a "I understand" checkbox; real-account orders require a second confirmation with the order summary.

Bridge changes (tools/mt5-bridge/bridge.py):
- Add `POST /connect {server, login, password}` and `POST /disconnect`; validate and persist connection in the Wine-side MT5 terminal via `mt5.initialize(server=..., login=..., password=...)`.
- Add `GET /account` (already partially), `GET /health` (already), reconnect with exponential backoff.
- Never log passwords; redact in error messages.

Safety (mandatory, not optional):
- Confirmation dialogs for every order (market/limit/stop) and for close/partial-close/modify.
- Max order size cap (configurable in settings, default conservative).
- Allow-listed symbols (configurable; empty list = all allowed but warns).
- Audit log to SQLite: timestamp, account, action, symbol, volume, price, result, error — no credentials.
- Dry-run mode toggle (orders validated but not sent) for testing.
- Single-use approval tokens for high-risk actions (large size, real account) borrowed from devilforcex/Metatrader patterns.

Chart source toggle (status bar): `Broker (MT5 live)` vs `EzyView feed`. Swaps the adapter behind `loadHistory` + quote stream; both render through the one `EzyChart`. Broker side additionally overlays open positions/orders on the same chart.

Acceptance:
- User can add a demo MT5 account, see balance/equity, place a market order, modify SL/TP, close — all from the app.
- Credentials are retrievable only via OS keyring; grep of SQLite/logs shows none.
- Real-account mode cannot be enabled without the confirmation flow.
- Audit log contains one row per order attempt with no secrets.

### Phase 2 — Navigation / Information Architecture
Goal: dedicated pages/flows instead of one tab with panels.

- Introduce React Router with routes:
  - `/chart` (home, default) — chart workspace + dockable panels.
  - `/journal` — dedicated journal page.
  - `/fundamentals` — calendar/news/screener/heatmaps.
  - `/options` — options chain/pricer.
  - `/settings` — config, keys, themes, keybindings, brokers.
  - `/pine` — editor + backtest (can be modal or page).
- `App.tsx`: replace `showTrading/showJournal/showFundamentals/showOptions` booleans with route-driven layout; keep a persistent left rail + top toolbar + status bar.
- Multi-window: Tauri multi-window for chart pop-out and journal on second monitor; sync via shared store + Tauri events.
- Persist last route, panel sizes, window geometry in SQLite/localStorage.

### Phase 3 — Drawing Parity
- Full tool suite: trend line, ray, extended line, horizontal/vertical, channel, pitchfork, fib retracement/extension, Gann, Elliott, shapes, text, brush, measure, long/short position, price range.
- Selection model: click selects, Shift-click multi-select, drag handles, body move, resize cursors.
- Properties panel: color, width, style, opacity, text, lock, hide, z-order, template save/load.
- Magnet modes: off/weak/strong with visual snap indicator.
- Alerts on price levels/lines.
- Import/export drawings (JSON), persist per symbol+timeframe.
- `ObjectTree.tsx` integration: rename, group folders, visibility toggle, lock, delete, focus.

### Phase 4 — Charting Controls & Layouts
- Crosshair modes + sync across charts in grid.
- Multi-chart layouts (1/2/4/6/8) with per-chart symbol/timeframe.
- Replay mode with speed, step, auto-play, event markers.
- Price scales: normal/log/percentage, auto/manual, inverted.
- Sessions, extended hours, timezone, watermark, grid, themes (light/dark + custom).
- Drawing templates and chart templates; layout save/load (unlimited, no paywall).

### Phase 5 — Trading Journal
Dedicated `/journal` page with:
- Manual trade entry + auto-import from MT5 bridge history.
- Fields: symbol, side, entry/exit, size, SL/TP, fees, tags, emotion, setup, rule checklist, screenshots, notes, rating.
- Views: list, calendar heatmap, stats (win rate, expectancy, R-distribution, equity curve, drawdown, by symbol/setup/tag/time-of-day).
- Daily/weekly review templates, AI summary (via MCP/LLM), export CSV/PDF.
- Prop-firm tracking (max drawdown, daily loss limit, consistency).

### Phase 6 — Fundamentals
- Economic calendar (already `mcp__ezyview__economic_calendar`) with filters, impact, country, currency.
- News feed from ForexFactory/Investing/Reuters (adapter), sentiment, search.
- Earnings/dividends calendar, screener, heatmaps, macro map overlays on chart.
- Fundamental overlays: earnings markers on price chart, macro event vertical lines.

### Phase 7 — Pine Editor & Strategy Testing
- Monaco with autocomplete, lint, compile, run sandbox.
- Backtest engine: equity, drawdown, trades, metrics, parameter optimization.
- Script library with versioning and sharing.

### Phase 8 — Sharing / Export / Collaboration
- Export chart as PNG/PDF/SVG, data as CSV/JSON.
- Share link/image, embed snippet.
- Later: co-editing and cloud sync (optional, privacy-first local default).

### Phase 9 — Desktop, Multi-Monitor, MCP
- Workspace restore, native window management, global shortcuts.
- MCP server parity for all new capabilities (drawings, journal, MT5, fundamentals).
- Auto-update, crash reporting (opt-in), perf profiling.

### Phase 10 — Git Ops / CI / Report / Merge
Goal: land everything on `main` with green CI and a detailed report.

Flow (per user "git ops" convention):
- Work on a feature branch (e.g. `feat/drawing-reliability-mt5-login`), one PR per phase where practical.
- Commit after each green build; push with sandbox bypass (GitHub login not readable in sandbox).
- Open PR via GitHub MCP; include the detailed report in the PR body.
- Check CI status; fix any failures before merge.
- Merge PR (auto-merge, per locked decision) only after CI green and build finished.
- Post-merge: report branch, PR number, CI run, merged commit, and what shipped.

CI verification checklist:
- `pnpm typecheck` (all packages)
- `pnpm test` (Vitest) — drawing-tools, chart-engine, journal, mt5-adapter
- `pnpm build` (desktop + packages)
- Lint (oxlint) clean
- Tauri build smoke (desktop app launches)

Detailed report contents:
- Phases completed vs. planned; deferred items with reasons.
- Test counts and coverage deltas.
- Known limitations and follow-ups.
- Migration/upgrade notes for users.

## 3. Drawing Reliability — Detailed Root-Cause & Fix

Layers involved:
1. `EzyChart` click subscription (`packages/chart-engine/src/host.ts`).
2. `ChartHost.onClick` handler (`apps/desktop/src/ChartHost.tsx`).
3. Coordinate conversion (time/price from x/y).
4. `snapToOhlc` snapping.
5. Pending anchor state in store (`store.ts`).
6. `isComplete` completion logic.
7. `DrawingsPrimitive` rendering (`packages/chart-engine/src/drawings.ts`).

Fix checklist:
- [ ] Add `screenToTimePrice` with explicit validity + reason.
- [ ] Guard against NaN/Infinity and out-of-bounds.
- [ ] Render ghost anchor immediately on first click.
- [ ] Reset state in `finally`.
- [ ] Prevent duplicate completion via `drawingInProgress`.
- [ ] Unit tests for click→anchor in `packages/chart-engine` and `packages/drawing-tools`.
- [ ] E2E test: place 3-point trend line, verify 3 anchors, undo, redo.

## 4. Quick Chart Control Spec

Component: `ChartCommandInput`
- Location: top-left overlay on the chart canvas.
- Trigger: `Ctrl+K`, `/`, or click.
- Modes: symbol search, timeframe, command (`/`).
- Data: watchlist + `list_symbols()` + recent (max 10).
- Keyboard navigation: ↑↓, Enter, Esc.
- Persist recents in store/localStorage.

## 5. MT5 Real-Account Login Flow Spec

See Phase 1. Summary of surfaces:
- Settings → Brokers → Add MT5 account modal.
- Credential storage: OS keyring only; never SQLite/logs.
- Session token: in-memory only.
- Safety: confirmation dialogs, max order size, allow-listed symbols, audit log, dry-run mode, single-use approval tokens for high-risk actions.
- Chart source toggle in status bar.

## 6. Navigation Spec

Routes and persistent shell:
- Left rail: Chart, Journal, Fundamentals, Options, Pine, Settings icons.
- Top toolbar: symbol, timeframe, chart type, indicators, drawings, layout, theme.
- Status bar: data source, MT5 bridge status, last update, errors.
- Panels become dockable tabs inside each page (not global booleans).

## 7. Research Gaps / Next Extraction (Optional, not blocking)

- TV Pro gating strings: search `locales/en.json` for "layout", "saved", "Pro" to enumerate paywalled features EzyView will ship free.
- Related repos (trading journals, MT5, fundamentals) summarized in `docs/research-repos.md`; refresh as needed.
- Deeper feature extraction possible if user opens TV live for screenshots.

## 8. Explicit Non-Goals (This Phase)

- No source code changes.
- No dependency additions.
- No builds/tests beyond confirming baseline already green.

## 9. Approval Gate

Implementation begins only after user approves this plan (or a revised version). Recommended start: Phase 0 (drawing reliability + command input), since it unblocks all later phases. Then Phase 1 (MT5 real-account login), then Phases 2–9, then Phase 10 (git ops).