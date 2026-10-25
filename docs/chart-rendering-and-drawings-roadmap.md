# EzyView — Chart Rendering & Drawings: Research, Audit and Phased Roadmap

Date: 2026-10-25
Scope: `packages/chart-engine`, `packages/drawing-tools`, `apps/desktop`
Baseline: `main` at `1a99934` (v0.3.2), 121 test files / 1171 tests passing.
Companion: `docs/ezyview-chart-parity-review-2026-10-25.md` (the drawing-parity review that this document extends).

---

## 1. Research summary

### 1.1 TradingView (source: tradingview.com/free-charting-libraries, advanced-charts)

TradingView splits its offering into three tiers. EzyView currently sits between
Lightweight Charts and Advanced Charts on capability.

**Chart types (14):** candles, bars, hollow candles, Heikin-Ashi, volume candles,
columns, line, area, baseline, step line, HLC area, high-low, HLC bars, Renko,
line break, Kagi, Point & Figure, session volume profile.

**Chart types EzyView has (10):** candles, bars, hollow, heikin, line, area,
baseline, renko, kagi, pnf. **Missing: columns, high-low, line break, range,
tick, session volume profile, volume candles.**

**Drawing tools (110+):** TradingView groups them into trend, fib, Gann, shapes,
annotation, patterns (XABCD, Cypher, head & shoulders, ABCD, three drives,
Elliott, cup & handle), projection (date/price range, forecast, bars pattern),
and prediction (long/short position, measure). EzyView has 20 tools.

**Price scales (up to 8):** normal, logarithmic, percent, inverted, auto, manual,
indexed-to-100, locked. EzyView has normal, log, percent, inverted.

**Interactivity:** zoom across scales, mouse-wheel zoom, chart scrolling,
right-click menu, go-to-date, bar countdown, events on chart (earnings, news,
corporate actions), symbol comparison, multiple price-series overlay, indicator
templates, 100+ indicators, custom indicators.

**Trading:** chart trading (orders/positions on chart), trading history on chart,
depth of market, bracket orders, various order types, account/position tracking.

**Synchronized charts:** cursor sync, symbol/interval sync, time sync, drawings sync.

**Events on chart:** earnings, news, corporate actions, ideas on price bars.

**Rendering:** WebGL for large histories (TradeCanvas, FlowMap), tick coalescing,
incremental indicator append.

### 1.2 MetaTrader 5 (source: mql5.com/docs)

MT5 has 44 graphical object types, grouped into:

- **Lines:** vertical, horizontal, trend, trend-by-angle, cycle, arrowed, channel,
  stddev channel, regression channel, pitchfork, Gann (line/fan/grid).
- **Fibonacci:** retracement, time zones, fan, arcs, channel, expansion.
- **Shapes:** rectangle, triangle, ellipse.
- **Arrows:** 10 arrow variants (thumb up/down, up/down, stop, check, buy/sell,
  left/right price labels).
- **Text:** text, label, button, edit, bitmap, bitmap label, rectangle label
  (custom UI), chart (sub-chart), event.
- **Channels:** equidistant, stddev, regression, pitchfork.

MT5 objects are command-queued (visual changes happen on chart event handling,
not immediately) and require `ChartRedraw()`. EzyView already redraws
immediately via LWC's primitive API.

### 1.3 Other open-source charting platforms

| Platform | Strengths worth copying |
|---|---|
| **deepentropy/lightweight-charts-drawing** | MIT, renderer-neutral drawing core (kind + time/price points + style), one LWC primitive for drawings/previews/handles/labels, 86 tools, multi-select/group drag, magnet, interval visibility, host-owned undo with `gestureEnd`. |
| **tradecanvas** | 69 tools, per-tool settings schemas, editable defaults, style templates, timeframe visibility, drawing-bound alerts, multi-select, named groups, one undo step per compound edit, plugin hooks with `priceAt` for alerts. |
| **marketcalls/openalgo-charts** | 87 tools, headless `DrawingController`, Objects dock, drawing alerts, undo/redo, drawing-tool search for mobile, touch sizing. |
| **OpenCharts** | Terminal integration reference (adapter contract, panel composition, weak/strong magnet, object tree). |
| **FlowMap** | Tauri + Python sidecar + WebGL2, Parquet replay, DOM/tape/CVD, feed-health/capability badges, performance HUD. |
| **HyperData Terminal** | Labels feeds LIVE/PARTIAL/STALE/DRIFT, separates confirmed from estimated events, read-only MCP. |
| **LuxAlgo/PineTS** | v5/v6, UDFs, arrays/maps/matrices, `request.security`, label/line/box/table, alerts, strategy commission/slippage/pyramiding. |
| **nullarch/resin** | v5/v6 compiler with UDTs/methods, collections, nested requests, broker emulator (pyramiding, commission, slippage, OCA, margin calls, bar magnifier), TradingView differential testing. |
| **pynesys/pynecore** | v4-v6, full collections, security/alerts, broad strategy rules, large compat matrix. |
| **pinescription** | Bytecode VM, 164x over full recompute on Bollinger benchmark. |

### 1.4 Key insight from research

The two most important architectural lessons from the open-source peers:

1. **A renderer-neutral drawing core** (deepentropy's `kind` + points + style)
   with one LWC primitive handles all rendering, preview, handles and labels.
   EzyView already has this split (`drawing-tools` package + `DrawingsPrimitive`),
   but the tool catalogue and multi-select are behind.

2. **`priceAt(drawing, time)` as the alert contract** (tradecanvas's plugin
   hooks). EzyView's drawing alerts are gated on `hasLevel` (horizontal lines
   only). A geometry query per tool would unlock alert-on-drawing for trend
   lines, channels, fibs, and fans.

---

## 2. Current code state (what EzyView has)

### 2.1 Chart rendering (packages/chart-engine)

**Chart types (10):** candles, bars, hollow, heikin, line, area, baseline, renko,
kagi, pnf. All transform-based (no data-dependent types like tick/footprint).

**Price scales:** right scale only, normal/log/percent/inverted/auto/manual.

**Primitives:** drawings, session bands, fundamental lines, volume profile,
bg bands (Pine bgcolor), markers (script + fundamental).

**Features:** crosshair sync, multi-chart grid (1-9), link groups, session
shading, volume profile, watermark, replay, indicators (separate panes),
fundamental events overlay.

**Missing:** columns, high-low, line break, range, tick, session volume profile,
volume candles, compare/overlay symbols, multi-pane resize/reorder, feed-health
badges, bar countdown, events on chart (earnings/news on time scale).

### 2.2 Drawings (packages/drawing-tools)

**Tools (20):** trend_line, ray, info_line, extended_line, horizontal_line,
horizontal_ray, vertical_line, parallel_channel, fib_retracement,
fib_extension, rectangle, ellipse, triangle, arrow, text, callout, brush,
measure, long_position, short_position.

**Missing families (from TradingView's 110+):**
- Pitchfork (standard, Schiff, modified Schiff, inside)
- Fib fan, arcs, channel, time zones, wedge
- Gann fan, box, square (fixed/from 2 points), time by 1/2/3
- Patterns: XABCD, Cypher, head & shoulders, ABCD, three drives, Elliott
  (impulse/correction/triangle/double/triple combo), cup & handle
- Projection: date & price range, price range, projected range, bars pattern,
  forecast
- Annotation: image, sticker/emoji, pin, comment, price note, arrow marker,
  highlighter
- Shapes: rotated rectangle, circle, polyline, arc, curve, double curve

**Interaction:** single selection only (`selectedDrawingId: string | null`),
no multi-select, no marquee, no group drag, no groups, no style clipboard,
no keyboard nudge, no object-tree search/reorder, OHLC-only magnet (no
drawing-to-drawing snap), brush strokes persisted verbatim (no simplification).

**Rendering:** one primitive, anchors projected per frame, rubber-band preview,
hover highlight, handles on selection. No geometry cache, no spatial index.

### 2.3 Pine transpiler (packages/pine-transpiler)

**AST nodes:** NumberLit, StringLit, BoolLit, NaLit, Identifier, MemberExpr,
IndexExpr, CallExpr, UnaryExpr, BinaryExpr, TernaryExpr, AssignExpr, ArrayLit,
Block, IfStmt, ForStmt, WhileStmt, ReturnStmt, ExprStmt, VarDecl, DeclStmt.

**Missing language features:** no function declaration node (UDFs), no
`request.*`, no collections (array/map/matrix), no label/line/box/table,
no `alert()`/`alertcondition()`, no `switch`, no `for ... in`, no UDTs/methods.

**plot() gaps:** ignores `offset`, `fill`, `trackprice`, `display`.
**plotshape() gaps:** ignores `offset`, `text`, `textcolor`, `size`.

**Execution:** still uses `new Function` (CSP `unsafe-eval`); Worker isolates
UI but not host. TA memoization is by source-array identity, so per-bar
computed series cause O(n²).

**Backtest:** `strategy.exit` stores stop/profit in `qty` field; `backtest()`
never reads it — exits at market price, not bracket. Tester runs with
defaults ($10k, 0 commission, 0 slippage, close-only fills) even though
`BacktestOptions` supports all of them.

### 2.4 Alerts (packages/data-adapters + apps/desktop)

**Conditions (9):** price above/below, crossing, crossing up/down, greater/less,
percent change, channel break.

**Gaps:** price-only (no indicator-plot alerts, no multi-condition AND/OR, no
snooze, no expiry, no persisted event log). Drawing alerts only work on
horizontal lines/rays (`hasLevel` gate in ChartMenuHost).

### 2.5 Indicators (packages/indicators)

~99 catalog entries. Separate panes for non-overlay studies. Single-pass wma
and linregSlope added (perf). No incremental append on tick (full recompute).

---

## 3. Gap analysis (research vs. code)

### Chart rendering gaps

| Feature | TradingView | MetaTrader | EzyView | Priority |
|---|---|---|---|---|
| Chart types | 14 | 1 (OHLC) | 10 | P1 |
| Price scales | 8 (normal/log/%/inverted/auto/manual/indexed/locked) | 4 | 4 | P2 |
| Compare/overlay symbols | Yes | No | No | P1 |
| Multiple panes (resize/reorder) | Yes | Yes (subwindows) | Separate panes, no resize | P2 |
| Events on chart (earnings/news) | Yes | No | Fundamental lines only | P2 |
| Bar countdown | Yes | No | No | P3 |
| Feed-health badges | No (implicit) | No | Partial (provenance chip) | P2 |
| WebGL large-history | Yes | No | No | P3 |
| Tick coalescing | Yes | Yes | No | P2 |
| Incremental indicator append | Yes | N/A | No (full recompute) | P2 |

### Drawing gaps

| Feature | TradingView | MetaTrader | EzyView | Priority |
|---|---|---|---|---|
| Tool count | 110+ | 44 | 20 | P1 |
| Pitchfork | 4 variants | 1 | No | P1 |
| Fib fan/arcs/channel/time zones | Yes | 4 types | Retracement + extension only | P1 |
| Gann fan/box/square | Yes | 4 types | No | P1 |
| Patterns (XABCD/H&S/Elliott) | Yes | No | No | P1 |
| Projection (forecast/bars pattern) | Yes | No | No | P2 |
| Image/sticker annotations | Yes | Bitmap | No | P1 |
| Multi-select | Yes | No | No (single only) | P0 |
| Named groups | Yes | No | No | P1 |
| Object snapping (drawing-to-drawing) | Yes | No | OHLC only | P1 |
| Keyboard nudge | Yes | No | No | P1 |
| Object tree search/reorder | Yes | No | No (select/hide/lock/rename/delete) | P1 |
| Style clipboard (copy/paste style) | Yes | No | Implicit auto-learn only | P1 |
| Brush simplification | N/A | N/A | No (verbatim persist) | P0 |
| Geometry cache | N/A | N/A | No | P2 |
| Spatial index for hit-test | N/A | N/A | No | P2 |
| Touch support (44px handles) | Yes | Yes | No | P2 |

### Pine gaps

| Feature | TradingView | EzyView | Priority |
|---|---|---|---|
| User-defined functions | Yes | No (no AST node) | P1 |
| Collections (array/map/matrix) | Yes | Partial (ArrayLit only) | P1 |
| `request.security` | Yes | No | P1 |
| `label/line/box/table` | Yes | No | P1 |
| `alert()`/`alertcondition()` | Yes | No | P1 |
| `switch`, `for...in`, UDTs | Yes | No | P2 |
| `plot()` offset/fill/display | Yes | Ignored | P2 |
| `plotshape()` text/size | Yes | Ignored | P2 |
| Strategy commission/slippage/pyramiding | Yes | Defaults only | P0 |
| Strategy brackets (stop/profit) | Yes | Stored in qty, never read | P0 |
| `new Function` execution | N/A | Yes (CSP unsafe-eval) | P1 |
| TA memoization (per-bar) | N/A | By source identity (O(n²)) | P1 |
| Differential testing | N/A | No | P2 |

### Alert gaps

| Feature | TradingView | EzyView | Priority |
|---|---|---|---|
| Price conditions | 9 types | 9 types | Done |
| Indicator-plot alerts | Yes | No | P1 |
| Multi-condition (AND/OR) | Yes | No | P2 |
| Drawing alerts (any geometry) | Yes | Horizontal lines only | P0 |
| Snooze/expiry | Yes | No | P2 |
| Persisted event log | Yes | No | P2 |
| Background evaluation | Yes | Price only | P1 |

---

## 4. Phased fix/upgrade plan

### Phase 0 — Correctness (2-4 days, ship before anything else)

These are small, each has a clear test, and several get harder once groups/images
exist.

| # | Fix | Files | Acceptance |
|---|---|---|---|
| 0.1 | Chart-scoped drawing undo | `store.ts`, `ChartHost.tsx`, `ChartPage.tsx` | 2-cell test: edit B, focus A, undo leaves A untouched and reverts B |
| 0.2 | Real strategy brackets | `pine-transpiler/src/backtest.ts`, `evaluate.ts`, `runtime.ts` | Stop/target fixtures fill at the requested level; market close unchanged |
| 0.2b | Expose backtest costs and OHLC fills | `pineRunner.ts`, `pine.worker.ts`, `PineEditor.tsx` | Tester shows and uses cash/commission/slippage/multiplier; a costed fixture loses money |
| 0.3 | Alert any drawing geometry | `drawing-tools/src/geometry.ts` (new `priceAt`), `ChartMenuHost.tsx`, `store.ts` | Trend line, channel, fib level alerts fire; moving the drawing updates the alert |
| 0.4 | Brush/storage budgets | `ChartHost.tsx`, `drawingsIO.ts`, `geometry.ts` | 10k-point stroke stores <2k; import over cap is rejected with a message |
| 0.5 | IO version gate + migrations | `drawingsIO.ts` | v2 file on v1 build says "newer format"; v1 file loads |
| 0.6 | Docs correction | `MASTERPLAN.md` | No stale complexity claim (highest/lowest are now O(n) via deque) |

**Do not add new tool IDs until 0.1 and 0.5 land.**

### Phase 1 — Drawing breadth and multi-object editing (2-3 weeks)

#### 1.1 Model changes (first, before any new tool)
- `Drawing.groupId?: string`, `Drawing.zIndex?: number`
- `Drawing.pattern?: { kind, ratios?, labels? }` for harmonic/Elliott
- `Drawing.image?: { assetId, width, height, lockAspect }` (assets in IndexedDB)
- `Drawing.scale?: "chart" | "screen"` for stickers/pins
- Schema v2 + migration; keep v1 import working
- `TOOL_LEVELS` / `priceAt` for alertable geometry

#### 1.2 Tool packs (each: spec, renderer, hit-test, anchors, tests)
Order by user value:
1. **Pitchfork pack** (4 variants: standard, Schiff, modified Schiff, inside)
2. **Fib pack** (fan, arcs, channel, time zones, wedge) — reuse `fib.ts`
3. **Gann pack** (fan, box, square fixed, square from 2 points, time by 1/2/3)
4. **Pattern pack** (XABCD, Cypher, H&S, ABCD, three drives, Elliott, cup & handle)
5. **Image/sticker pack** (image, sticker/emoji, pin, comment, price note, arrow marker, highlighter)
6. **Projection pack** (date & price range, price range, projected range, bars pattern, forecast)
7. **Shape pack** (rotated rectangle, circle, polyline, arc, curve, double curve)

**Caution:** do not ship a catalogue row whose renderer is a placeholder —
that is the failure mode of egui-charts (98 listed types, some approximate,
magnet not applied).

#### 1.3 Multi-select and groups
- `selectedDrawingIds: string[]` plus derived single id for compatibility
- Shift-click toggles, marquee selects, Ctrl+A selects all unlocked
- Group drag with one undo entry; group style/lock/hide/delete/z-order
- Named groups in object tree, collapsible, with group visibility
- Copy/paste of multi-selection (paste offsets all anchors by same delta)
- Selection box draws anchor handles only for primary object

#### 1.4 Alerts on geometry
- `priceAt(drawing, time)` per tool; channels and fib expose multiple levels
- Alert binding `{drawingId, levelKey}`; recompute level on move, persist
- Support `crossing` and `crossing_up/down` first; add `greater/less` for horizontals

#### 1.5 Object snapping
- Priority: anchor → edge/midpoint → fib level → OHLC (weak/strong) → free
- Visual snap glyph + Ctrl override (already the magnet override key)
- Snap only to visible, unlocked objects on the same chart

#### 1.6 Interaction and accessibility
- Arrow nudge (1px; Shift 10px) with one undo entry; Alt+arrow moves by bar
- Tab cycles objects in z-order; Shift+Tab reverses; Enter opens settings
- `aria-live` announces "Trend line selected, 2 of 7"
- Object tree: search, filter by type, front/back buttons, drag reorder
- Touch: 44px handles, long-press opens context menu, no hover-only action

#### 1.7 Rendering/perf
- Cache projected geometry per drawing keyed by `(timeRange, priceRange, size)`
- RDP brush simplification; text metrics cache; batch strokes by style
- Spatial index (bbox) for hit-testing above ~200 objects
- Target: 500 mixed drawings, pan/zoom at 60fps on reference laptop

### Phase 2 — Chart experience parity (1.5-2 weeks)

1. **Chart types** — columns, high-low, line break, range; then tick/footprint
   only when data adapter proves tick/depth coverage.
2. **Compare/overlay** — add symbol with percent normalization, ratio and spread
   modes; per-overlay color/scale; legend chips.
3. **Panes** — resize/maximize/reorder indicator panes; per-pane scale; save
   pane heights in layout.
4. **Alerts 2.0** — indicator-plot source, multi-condition rules, expiry,
   snooze, event log, rule evaluation independent of open chart (including
   watchlist symbols); one poller pass.
5. **Replay 2.0** — jump-to-date, step one bar, speed presets, optional
   paper-order execution against replay clock; link replay cursor to journal.
6. **Feed health** — badge each chart/panel with `live | delayed | demo |
   synthetic | stale`, last-tick timestamp and source; never let synthetic
   depth look real.
7. **Keyboard** — user-editable map with conflict detection; keep shortcut sheet
   as discoverable surface.
8. **Performance** — tick coalescing, incremental indicator append, 100k-bar
   cold-load budget; publish numbers in docs and CI artifacts.

### Phase 3 — Pine parity and sandbox (3-5 weeks)

#### 3.1 Language
- User-defined functions (single/multi-line, tuple returns), methods, UDTs,
  `switch`, `for...in`, line continuations, library imports.
- Correct scoping and call-site state for recursive series usage.

#### 3.2 Runtime
- Collections: `array`, `map`, `matrix` with Pine's mutating semantics.
- `request.security`, `request.security_lower_tf`, `lookahead`, nested requests
  with supplied feed provider.
- Drawings: `label`, `line`, `box`, `table` emitted as structured events to host.
- Alerts: `alert()`, `alertcondition()`, `alert.freq_*` → same alert engine.
- Missing built-ins: `str.*`, `time`/`timestamp`, `dayofweek`, `barstate.*`,
  `syminfo.*`, `session.*`, `math.random`, `hline`, `fill`, `plotchar`,
  `plotarrow`, `plot` offset/display.
- Strategy: commission models (%/cash), slippage ticks, pyramiding, OCA,
  trailing stops, margin/risk rules, intrabar fill assumptions in UI.

#### 3.3 Execution and security
- Replace `new Function` with build-time ESM generation or bytecode VM.
- Drop `unsafe-eval` from CSP.
- Worker watchdog with wall-clock cap; compile-time loop limits; output caps.
- Transfer OHLCV and outputs as typed arrays; avoid cloning full history.

#### 3.4 Performance
- Memoize TA at call site, not by source-array identity.
- Keep rolling buffers, avoid per-bar array copies.
- Benchmark 100k bars, publish number.

### Phase 4 — Terminal ecosystem and release hardening (2-3 weeks)

1. **Journal = process record.** Pre-trade plans linked to executions, playbook
   rules with adherence stats, local screenshots, MAE/MFE, account-aware equity.
2. **Options strategy builder.** Multi-leg payoff at expiry and selected dates,
   live Greeks, saved strategies, explicit preview before any order.
3. **Screener workflow.** Formula fields, saved screens, "why it matched",
   open result in chart/compare, alert on screen membership.
4. **Order flow honesty.** Real depth vs synthetic, footprint/CVD, liquidity
   heatmap; label coverage per feed.
5. **MCP.** Read-only scope by default, per-tool permission, provenance and
   timestamps in results, audit log, explicit approval for mutations.
6. **Extension model.** Stable interfaces for data adapters, indicators, drawing
   tools and panels; sandbox untrusted code; conformance tests.
7. **Release gates.** Playwright specs for drawing placement, multi-select,
   settings modal, alert-on-drawing, keyboard nudge; visual baselines in pinned
   container; axe accessibility check; perf artifact; signed/checksummed .deb.

---

## 5. Priority table (ranked)

| Rank | Item | Phase | Impact | Effort |
|---|---|---|---|---|
| 1 | Chart-scoped undo | 0 | Prevents wrong-chart data loss | S |
| 2 | Strategy brackets + cost inputs | 0 | Backtest numbers become honest | M |
| 3 | Alert any drawing geometry | 0 | Core TradingView workflow | M |
| 4 | Multi-select + groups | 1 | Biggest daily editing gap | L |
| 5 | Pitchfork + fib fan/arcs/channel/time zones | 1 | Highest-value missing tools | L |
| 6 | Gann fan/box/square | 1 | Trader expectation | M |
| 7 | Patterns (XABCD/H&S/Elliott) | 1 | Analysis depth | L |
| 8 | Image/sticker annotations | 1 | Research workflow | M |
| 9 | Object snapping + keyboard nudge | 1 | Precision/accessibility | S-M |
| 10 | Pine UDF + collections | 3 | Script compatibility | L |
| 11 | `request.security` | 3 | Multi-timeframe scripts | L |
| 12 | Pine drawings/alerts | 3 | Plotting parity | L |
| 13 | Remove `new Function` | 3 | Security/CSP | L |
| 14 | Chart types + compare | 2 | Visual parity | M |
| 15 | Indicator/multi-condition alerts | 2 | Alert parity | M |
| 16 | Feed-health badges | 2 | Trust | S |
| 17 | Journal plans/playbooks | 4 | Product differentiation | L |
| 18 | E2E + visual gates | 4 | Regression safety | M |

S = 1-2 days, M = 3-5 days, L = 1-2 weeks for one developer familiar with the tree.

---

## 6. Non-goals and cautions

- Do not copy TradingView's proprietary bundle or Pine runtime. Reimplement
  public language behaviour from docs and fixtures.
- Do not equate tool count with parity. egui-charts lists 98 tools but its own
  README says magnet snapping is not applied and some tools are placeholders.
- Do not claim "full Pine v6" until the differential matrix exists.
- Do not add image/pattern tools before the schema migration and storage caps.
- Keep Lightweight Charts' Apache-2.0 attribution visible.
- Do not ship a catalogue row whose renderer is a placeholder.

---

## 7. Suggested first slice

If only one week is available: Phase 0.1 + 0.3 + 0.5, then P1 multi-select
model and the pitchfork pack. That sequence fixes silent data bugs, unlocks
alert-on-drawing (a headline TradingView feature), and proves the new tool
pipeline with one high-value family before committing to eight more.

---

## 8. Sources

- TradingView free charting libraries comparison (tradingview.com/free-charting-libraries)
- TradingView Advanced Charts (tradingview.com/advanced-charts)
- MetaTrader 5 graphical objects (mql5.com/en/docs/constants/objectconstants/enum_object)
- deepentropy/lightweight-charts-drawing (MIT, ~142 stars)
- bonguynvan/tradecanvas (MIT, 69 tools)
- marketcalls/openalgo-charts (Apache-2.0, 87 tools)
- dylanpersonguy/OpenCharts (MIT, 175 stars)
- LuxAlgo/PineTS, nullarch/resin, pynesys/pynecore, pinescription, pineforge-4pass
- FlowMap, HyperData Terminal, EdgeDepth Terminal, OpenAlgo Desktop
- Journedge, TradeNote, deltalytix, LuxAlgo/trade-journal
- tradesdontlie/tradingview-mcp, tedorigawa001/TradingView-MCP, options-chain-mcp, MaverickMCP
EOF
echo "written"