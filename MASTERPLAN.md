# EzyView — Master Plan

> Status: **Planning complete; build not started on the remediation track.** Historical milestones P0–P9 are merged to `main`; P10 is optional. This document is the single canonical plan. `docs/MEGA-PLAN.md` retains the original detailed research notes and is superseded by §7–§11 of this file.
> Owner: printezy247 · Date: 2026-10-20
> Companion detail: `docs/MEGA-PLAN.md` (research notes), `docs/ARCHITECTURE.md` (layering/storage rules).

---

## 0. Vision

Build an open, self-hostable trading terminal that matches (and where possible exceeds) TradingView on the dimensions traders actually pay for — charting, indicators, drawings, layouts, alerts, screeners, news/calendars, options, and a Pine Script editor — while adding what TradingView locks behind paywalls or omits entirely: a real trading journal, live MT5 execution, fundamentals integration, and full data ownership.

Non-goal: copying TradingView's proprietary data feeds or its closed cloud. We bring our own adapters (CCXT, Alpaca, broker APIs, MT5) and self-host. All Pro-gated features ship unconditionally and free.

---

## 1. What we researched

### 1.1 TradingView

Key findings:

- **It is an Electron shell, not the charting engine.** The desktop app is a window/tab/multi-monitor manager that loads `tradingview.com` (Supercharts) in webviews. Charting, indicators, Pine, drawings, alerts all live server-side in the web app. The shell provides: tabs, tab groups with color linking, multi-window, multi-monitor workspace restore, layouts, crosshair sync, fullscreen, MCP Server, crash view, tab monitor, proxy settings, hardware acceleration toggle, native notifications, file export, onboarding.
- **UI feature inventory** (full list in `docs/tradingview-desktop-ui-labels.md`): Supercharts, Indicators & strategies, Pine, Pine Screener, Screeners, Heatmaps (Stock/Crypto/ETF), Macro Maps, Options (Chain, Strategy Builder, Strategy Finder, Volatility, Volume), Options Volume, Fundamental Graphs, News / News Flow, Portfolios, Calendars (Economic, Earnings, Dividend, IPO, Revenue), Alerts, Watchlists, Symbol search, Layouts (create/copy/delete/duplicate, sort by name/date), Tabs linking by symbol/color, Crosshair sync, Multi-monitor, MCP Server, Share image, Copy image/link, Export, Keyboard shortcuts, Theme (dark/light/Tokyo Night), Proxy, Developer tools.
- **Paywall strings found**: "Ah. You've reached the limit of saved chart layouts in your plan…", "Increase your chart layout limit", "Upgrade now". → Pro features are gated by **saved layout count**, and (per public TradingView tiers) alert count, indicator count per chart, intraday data, second-based intervals, volume profile, etc. We will not replicate the paywall; all features free in self-host.
- **Pro-version parity target** (from public TradingView Pro/Pro+/Premium tiers + strings): multiple layouts, more indicators per chart, more alerts, volume profile, custom timeframes, intraday data, second-based bars, no ads, extended hours, more drawings, priority support. We implement all of these unconditionally.

What we did NOT extract (and won't): the proprietary web charting bundle and Pine runtime, which are server-delivered and licensed. We replace them with open equivalents (see §5, §6).

### 1.2 MetaTrader 5 on Linux (MQL5 article 625 + local install)

- Installed under `~/.mt5` (Wine prefix) at `/home/jack/.mt5/drive_c/Program Files/MetaTrader 5/`.
- `terminal64.exe`, `MetaEditor64.exe`, `metatester64.exe`, MQL5 include libs, Bases, MQL5 folder.
- Integration strategy: MT5's Python API (`MetaTrader5` package) only runs on Windows. Since MT5 runs in Wine on this Linux box, we host the MT5 bridge **inside the Wine prefix** (a small Python/FastAPI service, or `mt5api`) and call it over HTTP from the app backend. Alternative: `PyTrader` EA + websocket. We support both, defaulting to the REST bridge (`mt5api`) for simplicity, with an EA/websocket fallback for lower latency.
- MQL5 editor stays in MT5; our app surfaces MT5 symbols/positions/orders/history and can push orders via the bridge. We do not reimplement MQL5.

### 1.3 Locked decisions (planning pass, 2026-10-20)

- MT5 real-account login: in-app broker form (server/login/password) stored in the OS keyring only (never SQLite/logs); session token in-memory; demo-first; real mode requires explicit warning + "I understand" checkbox.
- Navigation: React Router routes (`/chart`, `/journal`, `/fundamentals`, `/options`, `/settings`, `/pine`) + persistent shell (left rail, top toolbar, status bar); replace boolean panel flags in `App.tsx`.
- Quick chart command input: top-left overlay on the chart canvas, triggered by `Ctrl+K` or `/`.
- Git ops: after CI green, auto-merge the PR and report.

### 1.4 Additional upgrades surfaced by the desktop-shell feature inventory

All to be implemented in-app with no paywalls:

- Tabs: color tags; tab linking by symbol; auto-restore tickers/intervals; detach/duplicate/pin tab; close others or to the right; reopen closed tab/window; custom tab titles.
- Multi-window and multi-monitor: new window, native multi-monitor workspace save/restore, crosshair sync across windows, fullscreen with hide-tabs mode, tab monitor, crash view.
- Layouts manager: create/copy/delete/duplicate; sort by name/date (A-Z, Z-A, newest/oldest); unlimited saved layouts (no paywall); "All layouts" view; return to my layouts; unsaved-changes guard on close.
- Crash view and tab monitor for diagnostics; reload tab; relaunch to update.
- Proxy settings (protocol, server IP/domain, port) and network controls.
- Hardware-acceleration toggle; app cache clear; factory reset; developer tools toggle.
- Native notifications (system notifications for alerts) and sound controls.
- File export: CSV/PNG/PDF/image copy, save image, copy image/link, always-ask-where-to-save.
- Onboarding flow; theme selection (dark/light/Tokyo Night/high-contrast).
- MCP Server exposure of chart/indicator/alert data to AI agents.
- Community ideas / trading ideas (read-only embeds), portfolios, watchlists.
- Help Center, release notes, keyboard shortcuts reference.

---

## 2. Feature parity target (TradingView-class)

Organized to mirror the TradingView desktop shell + Supercharts. Each item is a deliverable module.

### 2.1 Charting core

- Candlestick / OHLC / line / area / baseline / hollow candles / Heikin-Ashi / Renko / Kagi / Point & Figure / Range.
- Multi-pane (up to N panes), multi-chart layouts (1/2/4/6/8/9+), synced time scales, crosshair sync across windows.
- Timeframes: tick → 1s → 1m → … → 1M, custom intervals, session breaks, extended hours.
- Price scales: left/right, auto, log, %, inverted; multiple scales per pane.
- Crosshair modes (normal/hidden/magnet) and crosshair sync across windows/monitors.
- Chart chrome: timezone selector, watermark (symbol/interval), grid, zoom controls (+/-/reset to 100%), fullscreen (hide-tabs mode).
- Auto-restore tickers and intervals per tab; interval/symbol/date-range sync across color-tagged tabs.
- Themes: dark/light/custom; Tokyo Night; high-contrast.
- Indicators overlay & separate pane; drag-and-drop from toolbar; tool favorites and "add tools" picker.
- Replay mode (bar-by-bar, tick-level later) with step back/forward, speed, auto-play.

### 2.2 Indicators & strategies

- 50+ built-ins: SMA, EMA, WMA, VWMA, RSI, MACD, Bollinger, ATR, Stoch, Ichimoku, VWAP, Supertrend, Pivot Points, Volume Profile, Fibonacci, OBV, CCI, MFI, ADX, etc.
- Strategy tester: equity curve, drawdown, win rate, profit factor, trades list, walk-forward (later).
- Custom indicator SDK (JS/TS) + Pine Script v5/v6 transpiler (Opus-Aether-AI/pine-transpiler or OpenCharts pine-transpiler) → runnable in sandboxed WASM/JS.

### 2.3 Drawings

- Full suite: trend/ray/extended/horizontal/vertical lines, channels, pitchforks, Fibonacci retracement/extension/fan/arcs/time zones, rectangles, ellipses, triangles, arrows, text, brushes, highlighters, measure, long/short position tools with R:R.
- Magnet (off/weak/strong), angle snap (Shift 45°), multi-select, per-object styling, object tree panel, hide/show, lock, delete.
- Persistence per symbol/layout (DB + localStorage), import/export.
- Line-cross alerts.

### 2.4 Toolbar & panels

- Top toolbar: symbol, timeframe, chart type, indicators, drawings, alerts, replay, settings, screenshot/share, layout.
- Left tool rail (grouped, collapsible, customizable, hideable).
- Right panels: watchlist, DOM, order ticket, positions/orders/trade history, account, alerts, screener, calendar, news, chat/community ideas (read-only embeds).
- Bottom: status bar (connection, market status, time).

### 2.5 Layouts, tabs, windows

- Tabs: color tags; tab linking by symbol; auto-restore tickers/intervals; detach/duplicate/pin tab; close others or to the right; reopen closed tab/window; custom tab titles.
- Multi-window and multi-monitor: new window, native multi-monitor workspace save/restore, crosshair sync across windows, fullscreen with hide-tabs mode, tab monitor, crash view.
- Layouts manager: create/copy/delete/duplicate; sort by name/date (A-Z, Z-A, newest/oldest); unlimited saved layouts (no paywall); "All layouts" view; return to my layouts; unsaved-changes guard on close.
- Export: copy/save image, copy image address/link, export CSV/PNG/PDF, always-ask-where-to-save, file download status.
- Shell controls: proxy settings, hardware-acceleration toggle, app cache clear, factory reset, developer tools, onboarding, theme (dark/light/Tokyo Night/high-contrast).
- MCP Server exposure of chart/indicator/alert data to AI agents.

### 2.6 Alerts

- Price alerts, indicator alerts, drawing line-cross alerts, strategy alerts.
- Conditions: cross, enter/exit range, etc. Actions: in-app toast + sound, webhook, email, Telegram, push.
- Server-side alert engine (for self-host) + client-side for paper.

### 2.7 Screeners & heatmaps

- Stock/crypto/ETF/forex screeners with filters; heatmaps (stock, crypto, ETF); macro maps (bonds, yield curves, currencies).

### 2.8 Calendars & news

- Economic calendar (ForexFactory), earnings, dividends, IPO, revenue calendars.
- News flow (RSS: Reuters, Investing.com, CoinDesk, etc.) with symbol tagging.

### 2.9 Options

- Options chain, strategy builder, strategy finder, volatility surface, volume.

### 2.10 Sharing & export

- Share chart image/link, embeddable widget, export CSV/PNG/PDF, copy.

### 2.11 Pine Script editor

- Monaco-based editor, syntax highlighting, autocomplete, lint, compile, run on chart, backtest, publish (self-hosted library).

### 2.12 MCP Server

- Expose chart/indicator/alert data to AI agents (TradingView now ships an MCP server). We ship our own.

### 2.13 Accounts / plans

- Self-hosted auth (Supabase or own). No paywalls; optional tiers for hosted SaaS later.

---

## 3. Advanced features (beyond TradingView)

### 3.1 Trading journal (inspired by TradeNote, journedge, deltalytix)

- Auto-import trades from MT5/brokers; manual entry with screenshots, tags, notes, emotions, rule checklist.
- Stats: win rate, expectancy, R-multiple distribution, by setup/symbol/time-of-day, equity curve, drawdown.
- Reviews: daily/weekly, rule adherence scoring, AI summary.
- Prop-firm tracking, goals, risk limits.
- Storage: Postgres + file storage (screenshots).

### 3.2 MT5 integration

- Architecture: app backend → HTTP → MT5 bridge running in Wine (`mt5api` or custom FastAPI wrapping `MetaTrader5`).
- Features: live quotes, symbol info, account/equity/margin, positions, orders (market/limit/stop), modify SL/TP, close/partial close, history deals/orders, tester.
- Safety: demo-first, risk veto, single-use approval tokens, audit log (borrow from devilforcex/Metatrader patterns).
- Also support MetaApi cloud as alternative (optional).
- **Chart source toggle** (status bar): `Broker (MT5 live)` vs `EzyView feed`. MT5 exposes no chart UI, so this swaps the adapter behind `loadHistory` + the quote stream — both sources render through the one `EzyChart`. Broker side additionally overlays open positions/orders on the same chart; the toggle never implies a second renderer.

### 3.3 Fundamentals integration

- ForexFactory economic calendar (unofficial API / scraper).
- Investing.com: earnings, economic events, technicals gauge, news.
- Reuters: news feed (RSS / API).
- Earnings, dividends, options data (Yahoo Finance / Finnhub / Alpha Vantage adapters).
- Fundamental graphs on chart (revenue, EPS overlays).

### 3.4 Paper trading engine (OpenCharts-style)

- $100k virtual, 100× leverage, no commission, fills at latest price, SL/TP auto-close, P&L, margin.

### 3.5 Backtesting & replay

- Historical simulation on cached OHLCV; tick replay later; performance analytics; walk-forward optimization.

### 3.6 Real-time collaboration (later)

- Multi-user co-editing of chart layouts, comments, shared links.

---

## 4. Tech stack (recommended)

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind + shadcn/ui | matches our other projects; SSR + RSC |
| Charting | TradingView Lightweight Charts v5 + custom Canvas 2D plugins; evaluate CandleViewer/OpenCharts for advanced drawing | open, performant, MIT/Apache |
| State | Zustand + TanStack Query | simple, scalable |
| Editor | Monaco (Pine) | mature |
| Backend | Fastify (Node) + tRPC or REST | fast, TS-native |
| DB | PostgreSQL (Supabase) + TimescaleDB for OHLCV | time-series |
| Cache/realtime | Redis + WebSocket (Socket.IO or native) | low-latency ticks |
| MT5 bridge | Python FastAPI (`mt5api`) in Wine; optional Node client | MT5 Python API Windows-only |
| Fundamentals | Python scrapers (ForexFactory/Investing/Reuters) + scheduled jobs | reuse devils/Metatrader pattern |
| Desktop | Tauri v2 (or Electron) wrapping web app | small bundle, native multi-window |
| Mobile (later) | PWA first | |
| Auth | Supabase Auth or Lucia | |
| Infra | Docker Compose for self-host; Vercel for web demo | |
| Testing | Vitest + Playwright | |
| Lint/format | oxlint + oxfmt (per our standard) | |

---

## 5. Data adapters (bring-your-own)

- Crypto: CCXT (Binance, Bybit, OKX, etc.) REST + WebSocket.
- Stocks/ETFs: Alpaca, Polygon, Yahoo (delayed), Finnhub.
- Forex: OANDA, FXCM, or MT5 bridge.
- Futures: broker-specific (IBKR later).
- Fundamentals: Finnhub, Alpha Vantage, Yahoo, SEC EDGAR, ForexFactory, Investing, Reuters RSS.
- All behind a common `MarketDataAdapter` interface so users plug in their own.

---

## 6. Repository layout (planned)

```
EzyView/
├── apps/
│   ├── web/            # Next.js frontend
│   ├── desktop/        # Tauri wrapper
│   └── mt5-bridge/     # Python FastAPI (runs in Wine)
├── packages/
│   ├── chart-engine/   # lightweight-charts wrappers, plugins
│   ├── indicators/     # built-in indicators
│   ├── pine-transpiler/# Pine → JS
│   ├── drawing-tools/  # drawing primitives
│   ├── data-adapters/  # CCXT/Alpaca/MT5/etc
│   ├── journal/        # trading journal module
│   ├── fundamentals/   # calendar/news scrapers
│   └── ui/             # shared shadcn components
├── services/
│   ├── api/            # Fastify backend
│   ├── alerts/         # alert engine
│   ├── screener/       # screener service
│   └── collab/         # realtime collab (later)
├── docs/
├── infra/              # docker-compose, k8s
└── tests/
```

---

## 7. Phases & milestones

Status legend: **done** = merged to `main`; **next** = first build target once approved; **planned** = not started.

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| 0 | Drawing/chart-control reliability + quick chart command input | deterministic placement, undo/redo, command input works | **done** (PR #10) |
| 1 | MT5 real-account login flow (keyring, safety rails, audit log, chart source toggle) | place/close/modify via MT5 from app | **done** (PR #11) |
| 2 | Navigation / information architecture (React Router + persistent shell) | dedicated pages, no boolean panel flags | **done** (PR #12) |
| 3 | Drawing parity (full tool suite, selection/editing, properties, magnet, alerts) | edit/select/delete drawings | **done** (PR #13) |
| 4 | Charting controls & layouts (crosshair sync, multi-chart, replay, scales, themes) | layouts/timeframes/themes | planned |
| 5 | Trading journal (manual + MT5 import, stats, screenshots, reviews, prop-firm) | journal usable daily | planned |
| 6 | Fundamentals (calendar, news, earnings, screener, heatmaps, macro) | fundamentals panel live | planned |
| 7 | Pine editor & strategy testing (Monaco, lint, compile, backtest, optimize) | custom indicator runs | planned |
| 8 | Sharing / export / collaboration | export + share links | planned |
| 9 | Desktop, multi-monitor, MCP (workspace restore, native windows, MCP parity) | desktop app shipped | planned |
| 10 | Git ops / CI / report / merge | green CI, merged PR, report | planned |

Historical note: the original scaffold phases (P0–P9) are already delivered and merged to `main` (see git log). The phase table above re-sequences the remaining remediation and parity work per `docs/MEGA-PLAN.md`; it does not discard delivered work. Phase 10 is the standing git-ops close-out and runs after every green build.

Estimated: Phase 0 = 1 week; Phases 1–2 = 2 weeks; Phases 3–4 = 3 weeks; Phases 5–7 = 4 weeks; Phases 8–9 = 3 weeks. Solo dev with AI assistance.

---

## 8. Implementation status snapshot (observed in code)

Delivered (on `main`):

- Chart engine: `packages/chart-engine` (Lightweight Charts v5, 10 chart types incl. Renko/Kagi/P&F, indicators, bands, volume profile, drawings primitive, themes).
- Drawing tools: `packages/drawing-tools` (tool IDs, anchors, `isComplete`, magnet off/weak/strong with tests, geometry, `hitTest`/`hitTestAll`).
- Indicators, Pine transpiler, journal, fundamentals, options, paper-trading, data-adapters, mt5-adapter, mcp-server packages.
- Desktop app: Tauri v2, React 19, Vite 8, Zustand workspace store with persisted layouts/drawings/alerts/watchlist/Pine/replay/magnet, multi-chart grid, object tree, command palette, alerts dialog, replay bar, MT5 source toggle, API keys dialog.
- MT5: stdlib REST bridge (`tools/mt5-bridge/bridge.py`) with health/symbols/history/quote/account/positions/deals/order/close/cancel/modify; adapter with market data + trading; MCP transport alternative; OS keyring for MCP key.
- Tests: Vitest 5; drawing-tools, chart-engine, mt5-adapter, desktop unit tests.

Known gaps driving Phase 1–3:

- Phase 0 (closed, PR #10): placement is guarded — `EzyChart.screenToTimePrice` validity helper with reason codes, ghost anchor, `finally` cleanup, duplicate-click guard, invalid-click flash; redo stack + `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z`; `ChartCommandInput` owns `Ctrl+K`/`/` (feature palette moved to `Ctrl+Shift+K`).
- Phase 3 (closed, PR #13): drawings select/drag/delete with handles, undoable style edits, properties panel, object tree with Export/Import JSON, bound alerts on horizontal lines, single-anchor tools (horizontal line/vertical line/text) complete on first click. Deferred: multi-select, trend-line-angle alerts.
- Phase 2 (closed, PR #12): React Router routes (`/chart`, `/journal`, `/fundamentals`, `/options`, `/pine`, `/settings`) behind a persistent shell (left rail, toolbar, status bar); last route remembered. Boolean flags remain only for `/chart`'s docked side panels (watchlist/depth/objects/trading).
- Phase 1 (closed, PR #11): in-app broker login via bridge `POST /connect`/`/disconnect`, per-account passwords in the OS keyring (`mt5:<login>@<server>`), bridge-minted session id stamped on every write, SQLite audit log (`GET /audit`), max-volume/allow-list/dry-run rails, single-use approval tokens, real-account risk confirmation on connect and on source switch. The Brokers/Safety/Audit surfaces moved onto the `/settings` route in Phase 2 (PR #12); the footer `Mt5Setup` popover is gone.
- Journal and fundamentals exist but lack depth (screenshots, tags, emotions, rule checklist, stats breadth, news/screener/heatmaps). → Phases 5–6.

---

## 9. Phase 0 — Drawing/Chart-Control Reliability (detailed)

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
  - `snapToOhlc` is already a pure function in `packages/drawing-tools` with unit tests for OHLC snap, magnet off/on, and out-of-range. Keep and extend.
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

---

## 10. Phase 1 — MT5 Real-Account Login Flow (detailed)

Goal: let the user connect a real (or demo) MT5 account from inside EzyView, like MT5/TradingView settings, with safety rails.

Delivered (PR #11). One deviation: the flow's "Settings page `/settings` → Brokers section" is realized as tabs (Connection / Broker / Safety / Audit) inside the `Mt5Setup` footer popover, not a `/settings` route — that route is Phase 2's navigation work, the tabs moved onto it in Phase 2 (PR #12). Everything else shipped as specced: keyring-backed credentials, bridge-minted session tokens, masked account panel, demo/real risk gates, order rails, dry-run, audit log, and the source toggle with a real-account risk modal.

Flow:

- Settings page `/settings` → "Brokers" section → "Add MT5 account" button.
- Modal form: Server (dropdown from bridge server list or free text), Login (number), Password (masked), "Demo account" checkbox, "Save to keyring" toggle (default on).
- On submit: store credentials in OS keyring keyed by `(server, login)`; never write to SQLite or logs; password field cleared from React state after submit.
- Connect: app calls bridge `POST /connect` (or equivalent) with credentials fetched from keyring; bridge returns account info; app stores a session token (in-memory only) and marks bridge status "connected".
- Account panel shows: balance, equity, margin, free margin, P&L, leverage, server, login (masked except last 4).
- Disconnect: clears session token; credentials remain in keyring unless user chooses "Forget account".
- Demo vs real: default to demo; switching to real requires a confirmation dialog listing risk warnings and a "I understand" checkbox; real-account orders require a second confirmation with the order summary.

Bridge changes (`tools/mt5-bridge/bridge.py`):

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

---

## 11. Phase 2 — Navigation / Information Architecture (Delivered, PR #12)

Delivered as specced, with deviations:

- Journal on a second monitor (Tauri multi-window) deferred to Phase 9 — journal is a route today, not a pop-out window.
- Panel sizes / window geometry not persisted; only the last route is (localStorage `ezyview:lastRoute`).
- `/pine` keeps its editor as a full route (the spec allowed page or modal).
- `App.tsx` retains four page-local booleans for `/chart`'s docked side panels; navigation itself is route-driven.

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

---

## 12. Phases 3–9 — Feature parity & beyond (summary)

Detailed specs live in `docs/MEGA-PLAN.md` §§3–8; summary:

- **Phase 3 — Drawing parity**: full tool suite, selection model, properties panel, magnet modes, alerts on price levels, import/export, object tree integration. **Done (PR #13)** — deviations: multi-select deferred, trend-line-angle alerts deferred; included single-anchor completion fix.
- **Phase 4 — Charting controls & layouts**: crosshair modes + sync, multi-chart layouts, replay, price scales, sessions/extended hours/timezone/watermark/grid/themes, drawing/chart templates, unlimited layouts.
- **Phase 5 — Trading journal**: manual + MT5 auto-import, fields, views (list/calendar heatmap/stats/equity/drawdown), daily/weekly reviews, AI summary, prop-firm tracking.
- **Phase 6 — Fundamentals**: economic calendar with filters, news feed, earnings/dividends, screener, heatmaps, macro map overlays, fundamental overlays on chart.
- **Phase 7 — Pine editor & strategy testing**: Monaco autocomplete/lint/compile/run sandbox, backtest engine, parameter optimization, script library versioning/sharing.
- **Phase 8 — Sharing / export / collaboration**: PNG/PDF/SVG/CSV/JSON export, share link/image, embed snippet; later co-editing + cloud sync.
- **Phase 9 — Desktop, multi-monitor, MCP**: workspace restore, native window management, global shortcuts, MCP parity, auto-update, crash reporting, perf profiling.

---

## 13. Phase 10 — Git ops / CI / report / merge

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

---

## 14. Drawing reliability — root-cause & fix (reference)

Layers involved:

1. `EzyChart` click subscription (`packages/chart-engine/src/host.ts`).
2. `ChartHost.onClick` handler (`apps/desktop/src/ChartHost.tsx`).
3. Coordinate conversion (time/price from x/y).
4. `snapToOhlc` snapping.
5. Pending anchor state in store (`store.ts`).
6. `isComplete` completion logic.
7. `DrawingsPrimitive` rendering (`packages/chart-engine/src/drawings.ts`).

Fix checklist:

- [x] Add `screenToTimePrice` with explicit validity + reason.
- [x] Guard against NaN/Infinity and out-of-bounds.
- [x] Render ghost anchor immediately on first click.
- [x] Reset state in `finally`.
- [x] Prevent duplicate completion via `drawingInProgress`.
- [x] Unit tests for click→anchor in `packages/chart-engine` and `packages/drawing-tools` (`host.click.test.ts` validity matrix + counter; `store.test.ts` byte-for-byte undo/redo; magnet/`snapToOhlc` tests already in `drawing-tools`).
- [x] E2E test: place 3-point trend line, verify 3 anchors, undo, redo (manual pass in the running app; no browser harness in CI yet — see Phase 0 verification note).

---

## 15. Quick chart control spec (reference)

Component: `ChartCommandInput`

- Location: top-left overlay on the chart canvas.
- Trigger: `Ctrl+K`, `/`, or click.
- Modes: symbol search, timeframe, command (`/`).
- Data: watchlist + `list_symbols()` + recent (max 10).
- Keyboard navigation: ↑↓, Enter, Esc.
- Persist recents in store/localStorage.

---

## 16. MT5 real-account login flow spec (reference)

See Phase 1. Summary of surfaces:

- Settings → Brokers → Add MT5 account modal.
- Credential storage: OS keyring only; never SQLite/logs.
- Session token: in-memory only.
- Safety: confirmation dialogs, max order size, allow-listed symbols, audit log, dry-run mode, single-use approval tokens for high-risk actions.
- Chart source toggle in status bar.

---

## 17. Navigation spec (reference)

Routes and persistent shell:

- Left rail: Chart, Journal, Fundamentals, Options, Pine, Settings icons.
- Top toolbar: symbol, timeframe, chart type, indicators, drawings, layout, theme.
- Status bar: data source, MT5 bridge status, last update, errors.
- Panels become dockable tabs inside each page (not global booleans).

---

## 18. Repos to study / reuse (not reinvent)

| Repo | Use |
|---|---|
| tradingview/lightweight-charts | chart engine (Apache 2.0) |
| dylanpersonguy/OpenCharts | terminal shell, drawing tools, Pine transpiler reference, paper engine |
| basiltt/CandleViewer | GPU engine ideas, indicator ecosystem |
| hectorvss/tradingview-clone | module organization, 50+ modules reference |
| Opus-Aether-AI/pine-transpiler | Pine v5/v6 → JS compiler |
| OpenCharts pine-transpiler | alternative |
| Eleven-Trading/TradeNote | trading journal UX/data model |
| TheQuantum-Dev/journedge | institutional journal features |
| hugodemenez/deltalytix | AI journal + stats |
| devilforcex/Metatrader | MT5 EA + FastAPI gateway, safety patterns |
| dceoy/mt5api | MT5 REST bridge |
| sumedhkumar/mt5-trading-mcp | MT5 MCP server |
| xclunderrated/ForexFactory-Unofficial-API | economic calendar |
| viandwi24/forexfactory | FF client |

---

## 19. Risks & constraints

- **Legal**: TradingView's charting library (Advanced Charts / Trading Platform) is licensed and cannot be redistributed. We use the open Lightweight Charts + our own UI. Do not copy TV's proprietary JS or assets. The deb analysis was for feature parity research only; no TV code will be shipped.
- **MT5 bridge runs only on Windows/Wine**: the bridge host must be Windows or a Wine prefix; Linux/macOS clients call it over HTTP. Document clearly.
- **Fundamentals scraping**: ForexFactory/Investing/Reuters ToS; use caching, rate limits, and prefer official APIs where available (Finnhub, Alpha Vantage).
- **Data licensing**: delayed vs real-time; users bring their own keys.
- **Performance**: target 60fps with 1M+ candles; profile early; consider WebGL/OffscreenCanvas.
- **Scope creep**: keep Phase 0 tightly scoped; journal/fundamentals after charting works.

---

## 20. Open questions (resolved / pending)

1. Primary target platform: web-first or desktop-first? → **Resolved: desktop-first (Tauri v2), web build optional.**
2. Broker priority: MT5 only, or CCXT + Alpaca from day one? → **Resolved: MT5 first; CCXT/Alpaca adapters already present and selectable.**
3. Auth/hosting: self-host only, or hosted SaaS? → **Resolved: self-host default; optional SaaS later.**
4. Pine Script version target: v5 only or v5+v6? → **Resolved: v5 now, v6 later.**
5. Repo public (MIT) or private until P2? → **Resolved: public MIT.**

---

## 21. Approval gate

Planning is complete and approved. Phase 0 (drawing reliability + quick chart command input) is merged to `main` via PR #10. Phase 1 (MT5 real-account login) is merged to `main` via PR #11. Phase 2 (navigation / IA) is delivered via PR #12. Remaining order: Phases 3–9, with Phase 10 (git ops) closing out every phase.

Work proceeds on a feature branch with the git-ops flow (commit → push → PR → green CI → auto-merge → report), one PR per phase.

---

## 22. Research gaps / next extraction (optional, not blocking)

- TV Pro gating strings: search `locales/en.json` for "layout", "saved", "Pro" to enumerate paywalled features EzyView will ship free.
- Related repos (trading journals, MT5, fundamentals) summarized in `docs/research-repos.md`; refresh as needed.
- Deeper feature extraction possible if user opens TV live for screenshots.
