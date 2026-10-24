# Research — related repos surveyed

## Charting / TradingView alternatives
- tradingview/lightweight-charts — chart engine (Apache 2.0)
- dylanpersonguy/OpenCharts — terminal shell, drawing tools, Pine transpiler, paper engine
- basiltt/CandleViewer — GPU engine, indicator ecosystem
- hectorvss/tradingview-clone — 50+ modules reference
- AbhiGandhi02/TradingView-clone — faithful clone reference

## Pine Script
- Opus-Aether-AI/pine-transpiler — Pine v5/v6 → JS
- dylanpersonguy/OpenCharts (pine-transpiler package)

## Trading journals
- Eleven-Trading/TradeNote — open-source journal
- TheQuantum-Dev/journedge — institutional journal
- hugodemenez/deltalytix — AI journal + stats

## MT5 integration
- dceoy/mt5api — MT5 REST bridge
- devilforcex/Metatrader — MT5 EA + FastAPI gateway, safety patterns
- sumedhkumar/mt5-trading-mcp — MT5 MCP server
- PyTrader (Significant-Hacks / MchLrnX) — EA + websocket connector
- pymt5adapter — pythonic MT5 wrapper

## Fundamentals
- xclunderrated/ForexFactory-Unofficial-API — economic calendar REST
- viandwi24/forexfactory — FF client
- margato/fundamentus-unofficial-api — fundamentals scraper pattern
- jblanked News API — news events

## Reverse engineering
- morluto/rea — methodology + tooling used to extract TV desktop features

## 2026-10-25 pass — drawing, terminal, Pine, journal

### Drawing cores
- deepentropy/lightweight-charts-drawing — renderer-neutral drawing core, 86
  tools, multi-select/group drag, magnet, interval visibility, host-owned undo
- bonguynvan/tradecanvas — 69 tools, per-tool settings schemas, templates,
  drawing alerts, named groups, one undo per compound edit
- marketcalls/openalgo-charts — 87 tools, headless DrawingController, Objects dock,
  drawing alerts, undo/redo
- userFRM/egui-charts — 98 tool types, but self-described placeholders and no
  magnet snapping (a caution against catalogue-only parity)

### Terminal features
- TradeCanvas — linked 6-chart grids, replay with paper trading, WebGL path
- OpenTerminalUI — replay/compare, screener, filings with citations, options
  builder, plugins, MCP
- FlowMap — Tauri + Python sidecar, Parquet replay, DOM/tape/CVD, feed-health
  badges, performance HUD
- EdgeDepth Terminal — footprint/liquidity heatmap/volume profile, explicit
  no-live-execution boundary
- OpenAlgo Desktop — Tauri 2 broker adapters, sandbox mode, keyboard scalping
- HyperData Terminal — LIVE/PARTIAL/STALE/DRIFT feed labels, read-only MCP

### Pine runtime comparisons
- LuxAlgo/PineTS — v5/v6, UDFs, collections, security, drawings, alerts,
  strategy costs
- nullarch/resin — v5/v6, UDTs, nested security, broker emulator, differential
  testing
- Opus-Aether-AI/pine-transpiler — UDFs/UDTs, subset security, drawing events,
  strict-CSP standalone ESM factory
- be-thomas/OpenPineScript — v1–v5, collections, security, broker emulator
- pynesys/pynecore — v4–v6 semantics and compatibility matrix
- ferranbt/pinecone — Rust interpreter, reusable series buffers
- woodstock-tokyo/pinescription — bytecode VM, custom alert sinks
- pineforge-4pass/pineforge-engine — Pine→C++ and comparison results

### Journal / AI
- TheQuantum-Dev/journedge — plans linked to executions, playbooks, local screenshots
- LuxAlgo/trade-journal — 16 statement formats, FIFO/LIFO, playbooks, replay
- Eleven-Trading/TradeNote — self-hosted broker-export journal
- hugodemenez/deltalytix — futures/prop imports, AI coaching (CC BY-NC)
- tradesdontlie/tradingview-mcp, tedorigawa001/TradingView-MCP — chart evidence
  and replay control contracts
- options-chain-mcp, MaverickMCP — read-only MCP scope patterns
