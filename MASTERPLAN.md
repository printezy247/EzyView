# EzyView — Master Plan

> Status: **In build.** P0–P5 merged to `main`; P6–P9 remaining, P10 optional.
> Owner: printezy247 · Date: 2026-10-19

---

## 0. Vision

Build an open, self-hostable trading terminal that matches (and where possible exceeds) TradingView on the dimensions traders actually pay for — charting, indicators, drawings, layouts, alerts, screeners, news/calendars, options, and a Pine Script editor — while adding what TradingView locks behind paywalls or omits entirely: a real trading journal, live MT5 execution, fundamentals integration, and full data ownership.

Non-goal: copying TradingView's proprietary data feeds or its closed cloud. We bring our own adapters (CCXT, Alpaca, broker APIs, MT5) and self-host.

---

## 1. What we extracted from the deb files

### 1.1 TradingView Desktop (`tradingview_amd64.deb`, v3.4.1)

Method: extracted `app.asar`, ran `npx rea-agents analyze-javascript-application` (101 files, 1908 modules, 60 parsed JS), plus harvested the desktop shell's `resources/locales/en.json` (367 UI labels).

Key findings:

- **It is an Electron shell, not the charting engine.** The desktop app is a window/tab/multi-monitor manager that loads `tradingview.com` (Supercharts) in webviews. Charting, indicators, Pine, drawings, alerts all live server-side in the web app. The shell provides: tabs, tab groups with color linking, multi-window, multi-monitor workspace restore, layouts, crosshair sync, fullscreen, MCP Server, crash view, tab monitor, proxy settings, hardware acceleration toggle, native notifications, file export, onboarding.
- **UI feature inventory** (full list in `docs/tradingview-desktop-ui-labels.md`): Supercharts, Indicators & strategies, Pine, Pine Screener, Screeners, Heatmaps (Stock/Crypto/ETF), Macro Maps, Options (Chain, Strategy Builder, Strategy Finder, Volatility, Volume), Options Volume, Fundamental Graphs, News / News Flow, Portfolios, Calendars (Economic, Earnings, Dividend, IPO, Revenue), Alerts, Watchlists, Symbol search, Layouts (create/copy/delete/duplicate, sort by name/date), Tabs linking by symbol/color, Crosshair sync, Multi-monitor, MCP Server, Share image, Copy image/link, Export, Keyboard shortcuts, Theme (dark/light/Tokyo Night), Proxy, Developer tools.
- **Paywall strings found**: "Ah. You've reached the limit of saved chart layouts in your plan…", "Increase your chart layout limit", "Upgrade now". → Pro features are gated by **saved layout count**, and (per public TradingView tiers) alert count, indicator count per chart, intraday data, second-based intervals, volume profile, etc. We will not replicate the paywall; all features free in self-host.
- **Pro-version parity target** (from public TradingView Pro/Pro+/Premium tiers + strings): multiple layouts, more indicators per chart, more alerts, volume profile, custom timeframes, intraday data, second-based bars, no ads, extended hours, more drawings, priority support. We implement all of these unconditionally.

What we did NOT extract (and won't): the proprietary web charting bundle and Pine runtime, which are server-delivered and licensed. We replace them with open equivalents (see §2, §4).

### 1.2 MetaTrader 5 on Linux (MQL5 article 625 + local install)

- Installed under `~/.mt5` (Wine prefix) at `/home/jack/.mt5/drive_c/Program Files/MetaTrader 5/`.
- `terminal64.exe`, `MetaEditor64.exe`, `metatester64.exe`, MQL5 include libs, Bases, MQL5 folder.
- Integration strategy: MT5's Python API (`MetaTrader5` package) only runs on Windows. Since MT5 runs in Wine on this Linux box, we host the MT5 bridge **inside the Wine prefix** (a small Python/FastAPI service, or `mt5api`) and call it over HTTP from the app backend. Alternative: `PyTrader` EA + websocket. We'll support both, defaulting to the REST bridge (`mt5api`) for simplicity, with an EA/websocket fallback for lower latency.
- MQL5 editor stays in MT5; our app surfaces MT5 symbols/positions/orders/history and can push orders via the bridge. We do not reimplement MQL5.

---

## 2. Feature parity target (TradingView-class)

Organized to mirror the TradingView desktop shell + Supercharts. Each item is a deliverable module.

### 2.1 Charting core
- Candlestick / OHLC / line / area / baseline / hollow candles / Heikin-Ashi / Renko / Kagi / Point & Figure / Range.
- Multi-pane (up to N panes), multi-chart layouts (1/2/4/6/8/9+), synced time scales, crosshair sync across windows.
- Timeframes: tick → 1s → 1m → … → 1M, custom intervals, session breaks, extended hours.
- Price scales: left/right, auto, log, %, inverted; multiple scales per pane.
- Themes: dark/light/custom; Tokyo Night; high-contrast.
- Indicators overlay & separate pane; drag-and-drop from toolbar.
- Replay mode (bar-by-bar, tick-level later).

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
- Tabs with color tags; tab linking by symbol; auto-restore tickers/intervals; detach tab; multi-window; multi-monitor workspace save/restore; "All layouts" manager; copy image/link.

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

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| P0 | Repo scaffold, CI, docs, adapter interfaces | repo builds empty shells | done |
| P1 | Charting core + 10 indicators + 5 drawings + layouts/tabs | demo chart with live crypto data | done |
| P2 | Full indicator library (50+) + all drawings + alerts + watchlist + DOM | feature parity with TV free tier | done |
| P3 | Pine editor + transpiler + strategy tester + replay | custom indicator runs on chart | done |
| P4 | Paper trading engine + order ticket + positions | full paper trading loop | done |
| P5 | MT5 bridge + live trading (demo-first) + broker/EzyView chart source toggle | place/close order via MT5; switch chart feed between broker and EzyView | done |
| P6 | Trading journal + stats + screenshots | journal usable daily | next |
| P7 | Fundamentals (calendar/news/earnings) + screeners/heatmaps | fundamentals panel live |
| P8 | Options chain + volatility | options view |
| P9 | Desktop (Tauri) + multi-monitor + MCP server | desktop app shipped |
| P10| Collaboration + cloud sync + SaaS tiers | (optional) |

Estimated: P0–P2 = 6–8 weeks; P3–P5 = 6–8 weeks; P6–P9 = 8–12 weeks. Solo dev with AI assistance.

---

## 8. Repos to study / reuse (not reinvent)

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
| morluto/rea | reverse-engineering methodology for future targets |

---

## 9. Risks & constraints

- **Legal**: TradingView's charting library (Advanced Charts / Trading Platform) is licensed and cannot be redistributed. We use the open Lightweight Charts + our own UI. Do not copy TV's proprietary JS or assets. The deb analysis was for feature parity research only; no TV code will be shipped.
- **MT5 bridge runs only on Windows/Wine**: the bridge host must be Windows or a Wine prefix; Linux/macOS clients call it over HTTP. Document clearly.
- **Fundamentals scraping**: ForexFactory/Investing/Reuters ToS; use caching, rate limits, and prefer official APIs where available (Finnhub, Alpha Vantage).
- **Data licensing**: delayed vs real-time; users bring their own keys.
- **Performance**: target 60fps with 1M+ candles; profile early; consider WebGL/OffscreenCanvas.
- **Scope creep**: keep P1–P2 tightly scoped; journal/fundamentals after charting works.

---

## 10. Open questions for the user

1. Primary target platform: web-first (recommended) or desktop-first? (I propose web-first + Tauri desktop in P9.)
2. Broker priority: MT5 only, or also CCXT crypto + Alpaca stocks from day one?
3. Auth/hosting: self-host only, or also a hosted SaaS (Supabase) for sharing?
4. Pine Script version target: v5 only initially, or v5+v6?
5. Should the repo be public (MIT) like OpenCharts, or private until P2?

---

## 11. Approval

Reply with adjustments. Once approved, I'll start P0 (scaffold) — but not before.
