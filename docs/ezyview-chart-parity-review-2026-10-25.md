# EzyView chart & drawing parity — code review and phased backlog

Date: 2026-10-25
Scope: `apps/desktop`, `packages/drawing-tools`, `packages/chart-engine`,
`packages/pine-transpiler`, `packages/indicators`, `packages/mcp-server`.
Baseline: `main` at `55490e5` (the v0.3.2 drawing-parity commit), clean tree,
`120` test files / `1141` tests passing.

This is a review and a plan — no runtime code was changed for it. It focuses on
what is still missing or wrong after the four-phase drawing pass, and on ideas
worth adopting from comparable open-source projects.

---

## 1. Verdict

The drawing **interaction shell** is now genuinely TradingView-shaped: a left
rail with flyouts, global hide/lock, right-click drawing menu, floating
mini-settings, a tabbed settings modal with live preview, rubber-band previews,
undo grouping for drags, object tree, per-timeframe visibility and style
templates. What remains is not "make drawings work" — it is:

1. **Correctness debt** in a few places where the UI promises more than the
   model delivers (cross-chart undo, strategy brackets, drawing alerts).
2. **Breadth**: 20 tools against TradingView's ~60–90, with entire families
   absent (pitchfork, Gann, fib fan/arcs/channel/time zones, harmonics, Elliott,
   images/stickers, projections).
3. **Depth**: one selected object at a time, no groups, no object snapping, no
   style clipboard, no keyboard nudge, no object-tree search/reorder.
4. **Pine honesty**: the transpiler is a good v5/v6 *subset* but has no
   user-defined functions, collections, `request.security`, drawings or alerts,
   and `strategy.exit`'s stop/profit never reach the backtester.
5. **Terminal-level parity** that makes charts feel finished: more chart types,
   panes, compare, indicator alerts, feed-health badges, replay-to-paper.

Recommended order: Phase 0 first (small, correctness), then Phase 1 (drawing
breadth + multi-select), Phase 2 (chart/interaction), Phase 3 (Pine), Phase 4
(terminal ecosystem and release hardening).

---

## 2. What is already shipped (do not re-plan)

| Area | Shipped |
|---|---|
| Drawing tools | 20 tools across trend, fib, shapes, annotation, prediction (`packages/drawing-tools/src/tools.ts`) |
| Toolbar | Left rail, categories, flyouts, shortcuts (`T H V F R M`), favourites bar, global lock/hide, magnet, eraser |
| On-chart editing | Floating mini-settings, context menu, full tabbed modal (Style/Text/Coordinates/Visibility), live preview |
| Drawing lifecycle | Create, select, drag anchors/body, clone, copy/paste, lock, hide, z-order, rename, delete, JSON import/export |
| Preview | Rubber-band lines/shapes/fib/position, brush strokes, magnet to OHLC |
| History | Drawing undo/redo with one entry per drag (`commitDrawingHistory`), 30 states |
| Templates | Named drawing style templates; per-tool style auto-learn on style edit; chart templates |
| Visibility | Per-timeframe-unit visibility; global hide all |
| Chart engine | 10 chart types incl. Heikin-Ashi, Renko, Kagi, P&F; log/percent/invert scale; volume profile; session breaks; replay; crosshair sync; 1–9 chart grids; link groups |
| Indicators | ~99 catalog entries, separate panes for non-overlay studies |
| Pine | Monaco editor, autocomplete, lint, transpile to JS in a Worker, strategy tester (the engine supports commission/slippage/multiplier, the UI does not expose them), optimizer, versioned scripts |
| Alerts | Price conditions (9 kinds), frequency, history, drawing-bound level alerts for horizontal lines, desktop notifications |
| Quality | 1141 tests, CI (lint/typecheck/test/build/deb/lintian/smoke/cargo), release workflow, e2e smoke |

---

## 3. Findings (evidence-based)

Severity: **P0** = wrong result / data loss, **P1** = parity gap users hit
weekly, **P2** = polish/scale.

### P0-1 — Drawing undo is layout-global, not chart-scoped
`drawingUndo` / `drawingRedo` are single stacks on the workspace
(`apps/desktop/src/store.ts:240-243`), while `undoDrawing` applies the previous
snapshot to `layout.activeChart` (`store.ts:656-665`). `commitDrawingHistory`
accepts `chartIndex` in the interface (`store.ts:249`) but ignores it in the
implementation (`store.ts:714-718`). Drag on chart B, focus chart A, press
Ctrl+Z: B's snapshot is written onto A. This is the most concrete data-loss bug
in the drawing system.
**Fix:** key history by `layoutId + chartIndex` (or chart `uid`), pass
`chartIndex` through `updateDrawing`/`deleteDrawing`/`importDrawings`, and clear
only the affected chart's redo. Add a two-cell regression test.

### P0-2 — `strategy.exit` stop/profit never reach the backtester
`strategyExit` stores the stop/profit number in the order's `qty` field
(`packages/pine-transpiler/src/evaluate.ts:475-495`), and `backtest()` never
reads it: an `exit` action simply closes at the fill bar's open/close
(`packages/pine-transpiler/src/backtest.ts:130-142`). A strategy with a stop and
target therefore reports market-price exits, not bracket exits. There is also no
pyramiding, OCA or trailing behaviour.
**Fix:** give `PineOrder` explicit `stop`, `limit`, `trail`, `fromEntry`,
`oca` fields; implement per-position brackets against high/low (intrabar), keep
the current market-close path for `strategy.close`; add fixtures that prove a
stop fills at the stop price, not at the next open.

### P0-2b — The strategy tester runs the engine with defaults
Every run passes only closing prices: `backtest(result.orders, { close: ctx.close })`
(`apps/desktop/src/pineRunner.ts:155,164,193`; `pine.worker.ts:93`). That means
$10,000 starting cash, zero commission and slippage, no contract multiplier and
close-only fills, even though `BacktestOptions` supports all of them. A strategy
with costs can look profitable when it is not.
**Fix:** pass OHLC, expose initial cash, commission (cash or %), slippage,
multiplier and fill-on-next-open in the tester UI, persist them per script, and
show the active assumptions next to the equity curve.

### P0-3 — Drawing alerts only work on horizontal lines/rays
The context menu gates the alert action on `hasLevel`, which is true only for
`horizontal_line` and `horizontal_ray`
(`apps/desktop/src/ChartMenuHost.tsx:108-117`). Trend lines, channels, fib
levels, fans and patterns cannot be alerted, although TradingView treats "alert
on drawing" as a core feature.
**Fix:** add a geometry query per tool — `priceAt(drawing, time)` for straight
tools, level enumeration for channels/fibs/fans — and bind alerts to
`{drawingId, levelKey}`. Re-evaluate when the drawing moves; update the bound
alert in `syncBoundAlert`.

### P0-4 — Brush strokes and drawing counts have no budget
Brush points are appended for every pointer move and persisted verbatim
(`apps/desktop/src/ChartHost.tsx` brush path; `drawingsIO.ts` has no cap). A few
long strokes can exhaust the localStorage quota; the failure is silent.
**Fix:** simplify with Ramer–Douglas–Peucker at ~1.5–2 px, cap points per stroke
and drawings per chart, and surface a "drawings could not be saved" notice.
Validate the same limits on import.

### P0-5 — Import ignores the envelope version
`serializeDrawings` writes `{ version: 1 }`, but `parseDrawings` reads only
`drawings` and never checks `version` (`apps/desktop/src/drawingsIO.ts:10-30`).
A future v2 file (groups, images) will be silently half-read by an old build.
**Fix:** reject `version > CURRENT` with a clear message; add a migration table
now, before the schema grows in Phase 1.

### P1-1 — Single selection only
`selectedDrawingId: string | null` (`store.ts:255`); no multi-select, marquee,
group drag, group style/delete/lock, or `groupId` anywhere. This blocks the most
common TradingView editing workflow.
**Fix:** `selectedDrawingIds: string[]` plus a derived single id for
compatibility; shift-click toggles, drag-rectangle selects, one undo entry per
group gesture; optional named groups.

### P1-2 — Object snapping is OHLC-only
`snapToOhlc` snaps to the nearest bar's O/H/L/C
(`packages/drawing-tools/src/magnet.ts`). There is no snapping to other
drawings' anchors, edges, midpoints or fib levels.
**Fix:** layer a drawing-snap resolver ahead of OHLC magnet, with a visible snap
marker and a modifier to bypass. Keep the existing weak/strong semantics.

### P1-3 — Tool catalogue breadth
Present: 20 tools. Missing families, ranked by trading value:

1. **Pitchfork** — standard, Schiff, modified Schiff, inside (3 anchors + median).
2. **Fib fan, arcs, channel, time zones, wedge** — the retracement/extension pair exists, the rest do not.
3. **Gann fan, Gann box, Gann square (fixed/from 2 points), Gann time by 1/2/3**.
4. **Patterns** — XABCD, Cypher, head & shoulders, ABCD, three drives, Elliott impulse/correction/triangle/double/triple combo, cup & handle. These need labelled anchors and ratio readouts, not just polylines.
5. **Projection** — date & price range, price range, projected range, bars pattern, forecast/ghost feed.
6. **Annotation** — image, sticker/emoji, pin, comment, price note, arrow marker, highlighter.
7. **Shapes** — rotated rectangle, circle, polyline, arc, curve, double curve.

### P1-4 — No keyboard or screen-reader path for objects
Drawing selection is mouse-only; arrows do not nudge anchors; the object tree has
no search/filter and no reorder (rows select, hide, lock, rename, delete only —
`apps/desktop/src/ObjectTree.tsx`). Selection changes are not announced.
**Fix:** arrow nudge (Shift ×10) with a single undo entry, Tab/Shift-Tab cycling,
`aria-live` announcement, tree search and explicit front/forward/back/backward
buttons or drag reorder.

### P1-5 — Style defaults are implicit
`updateDrawing` auto-learns a tool's style whenever a style patch is applied
(`store.ts:690-700`), but there is no explicit "Set as default", "Reset", "Copy
style" / "Paste style", or "apply template to selection". Users cannot tell what
the default is or undo the learning.
**Fix:** a small style clipboard, a visible default chip in the modal, and an
explicit reset to `DEFAULT_DRAWING_STYLE`.

### P1-6 — Chart-type breadth
`ChartType` is 10 values (`packages/chart-engine/src/host.ts:38-48`). Missing
common types: columns, high-low, line break, range, tick, and
footprint/session-volume (data-dependent). Compare/overlay symbols are absent
even though percent scale exists.
**Fix:** add the transform-only types first (columns, high-low, line break,
range); treat tick/footprint as a data-capability item, not a canvas task.

### P1-7 — Alerts are price-only
`AlertCondition` has 9 price conditions
(`packages/data-adapters/src/alerts.ts:3-12`). Alive alerts are polled for their
own symbols (`apps/desktop/src/alertFeed.ts:63-75`), so background evaluation
exists for price rules — but there is no indicator-plot alert, no multi-condition
AND/OR, no snooze, expiry or persisted event log. Drawing alerts inherit the
single-level limitation (P0-3).
**Fix:** an alert rule model with `source: price | indicator | drawing`,
optional conjunction, `expiresAt`, `snoozedUntil`, and a persisted event log;
evaluate rules in one quote-poller pass.

### P1-8 — Pine language surface is a subset, and the gap is invisible
The AST has no function-declaration node (`packages/pine-transpiler/src/ast.ts`),
so `f(x) =>` scripts fail; there is no `request.*`, no `array/map/matrix`, no
`label/line/box/table`, no `alert()/alertcondition()`. `plot()` ignores
`offset`, `fill`, `trackprice` and `display` (`evaluate.ts:285-312`);
`plotshape()` ignores `offset`, `text`, `textcolor` and `size`
(`evaluate.ts:328-350`). The editor does not show a parity matrix, so users
discover gaps by failure.
**Fix:** publish a supported-feature matrix in the editor and docs, lint
unsupported namespaces with a precise message, then close the gaps in Phase 3.

### P1-9 — Pine execution model is unsafe and quadratic
Scripts still run through `new Function` (`apps/desktop/src/pineRunner.ts`,
`pine.worker.ts`), so the CSP keeps `unsafe-eval`. The emitted loop runs once
per bar and relies on a source-identity cache (`memoizeTa` in `runtime.ts:71-86`):
`ta.ema(close, 9)` is cheap because `close` has a stable identity, but a
per-bar source or length (`ta.ema(close * 2, len)`, a series length, an
`if`-selected expression) creates a new array each bar and recomputes the full
series — O(n²) per call. `request.security` would multiply that. The Worker
isolates the UI, not the host.
**Fix:** compile to a standalone ESM module at build time (no runtime eval) or
move to a small bytecode interpreter; keep call-site memoization; add a worker
watchdog and caps. The existing streaming `highest`/`lowest` deque helpers
(`packages/indicators/src/helpers.ts:86-137`) are the right pattern to extend.

### P2-1 — Documentation drift
`MASTERPLAN.md:772-774` still says `highest`/`lowest` are O(n × period), but the
helpers now use a monotonic deque (`packages/indicators/src/helpers.ts:86-137`). The same section says markers rebuild every
tick; that should be re-checked before it is repeated. Update the plan when a
phase lands, or the backlog starts lying.

### P2-2 — Test coverage is unit-heavy, browser-light
`e2e/` has `smoke.spec.ts` and local-only visual baselines. Drawing placement,
multi-object drag, settings modal, keyboard nudge and alert-on-drawing have no
browser-level test. Unit tests are strong (hit-test 379 lines, magnet, edit,
templates, IO, menu) but do not exercise pointer capture, DPR or focus.
**Fix:** one Playwright spec per interaction family, using deterministic demo
data; keep pixel comparisons local/containerised.

### P2-3 — Performance budgets are unmeasured in CI
`scripts/bench-indicators.ts` is a human-run gate. There is no budget for
drawings (e.g. 500 objects at 60 fps), indicator recompute on a tick, or cold
100k-bar load.
**Fix:** add a non-flaky benchmark harness with generous thresholds, reported as
an artifact rather than a hard gate.

---

## 4. Phase 0 — Correctness fixes (2–4 days)

Ship these before any new tool. They are small and each has a clear test.

| # | Fix | Files | Acceptance |
|---|---|---|---|
| 0.1 | Chart-scoped drawing history | `store.ts`, `ChartHost.tsx`, `ChartPage.tsx` | 2-cell test: edit B, focus A, undo leaves A untouched and reverts B |
| 0.2 | Real strategy brackets | `pine-transpiler/src/backtest.ts`, `evaluate.ts`, `runtime.ts` | Stop/target fixtures fill at the requested level; market close unchanged |
| 0.2b | Expose backtest costs and OHLC fills | `pineRunner.ts`, `pine.worker.ts`, `PineEditor.tsx` | Tester shows and uses cash/commission/slippage/multiplier; a costed fixture loses money |
| 0.3 | Alert any geometry | `drawing-tools/src/geometry.ts` (new `priceAt`), `ChartMenuHost.tsx`, `store.ts` | Trend line, channel and fib level alerts fire; moving the drawing updates the alert |
| 0.4 | Brush/storage budgets | `ChartHost.tsx`, `drawingsIO.ts`, geometry | 10k-point stroke stores <2k; import over cap is rejected with a message |
| 0.5 | IO version gate + migrations | `drawingsIO.ts` | v2 file on v1 build says "newer format"; v1 file loads |
| 0.6 | Docs correction | `MASTERPLAN.md` | No stale complexity claim |

Do not add new tool IDs until 0.1 and 0.5 land: both get harder once groups and
images exist.

---

## 5. Phase 1 — Drawing breadth and multi-object editing (2–3 weeks)

### 5.1 Model changes (first)
- `Drawing.groupId?: string`, `Drawing.zIndex?: number` (array order stays the
  source of truth; `zIndex` is only for imported files).
- `Drawing.pattern?: { kind, ratios?: number[], labels?: string[] }` for
  harmonic/Elliott annotations.
- `Drawing.image?: { assetId, width, height, lockAspect }`; assets live in
  IndexedDB, not localStorage.
- `Drawing.scale?: "chart" | "screen"` for stickers/pins that should not grow
  with zoom.
- `TOOL_ANCHORS` stays the creation contract; add `TOOL_LEVELS`/`priceAt` for
  alertable geometry.
- Schema v2 + migration; keep v1 import working.

### 5.2 Tool packs (each: spec, renderer, hit-test, anchors, tests)
1. **Pitchfork pack** — 4 variants; median line + two parallels; extend modes.
2. **Fib pack** — fan, arcs, channel, time zones, wedge; reuse `fib.ts` levels
   and per-level styles; arcs need radius/price-time scale handling.
3. **Gann pack** — fan, box, square fixed, square from 2 points, time by 1/2/3;
   angle is price-per-bar, so it must be recomputed on zoom, not cached.
4. **Pattern pack** — XABCD, Cypher, head & shoulders, ABCD, three drives,
   Elliott (impulse/correction/triangle/double/triple combo), cup & handle.
   Render labelled anchors and optional ratio badges; hit-test each leg.
5. **Projection pack** — date & price range, price range, projected range, bars
   pattern, forecast. The bars pattern should copy a selected range as a ghost
   series, not as a bitmap.
6. **Annotation pack** — image, sticker/emoji, pin, comment, price note, arrow
   marker, highlighter. Image needs a local asset store + export/import.
7. **Shape pack** — rotated rectangle, circle, polyline, arc, curve, double
   curve.

Order by user value: pitchfork → fib fan/arcs/channel/time zones → Gann fan →
XABCD/H&S/Elliott → image/sticker → projection. Do not ship a catalogue row
whose renderer is a placeholder; that is the failure mode of `egui-charts`
(98 listed types, some approximate, magnet not applied — see research below).

### 5.3 Multi-select and groups
- Shift-click toggles, marquee selects, Ctrl+A selects all unlocked.
- Group drag with one undo entry; group style/lock/hide/delete/z-order.
- Named groups in the object tree, collapsible, with group visibility.
- Copy/paste of a multi-selection; paste offsets all anchors by the same delta.
- Selection box draws anchor handles only for the primary object; secondary
  objects get a thin outline.

### 5.4 Alerts on geometry
- `priceAt(drawing, time)` per tool; channels and fib expose multiple levels.
- Alert binding `{drawingId, levelKey}`; when the drawing moves, recompute the
  level and persist it, with a subtle "level updated" note in the alert list.
- Support `crossing` and `crossing_up/down` first; add `greater/less` for
  horizontal levels.

### 5.5 Object snapping
- Priority: anchor → edge/midpoint → fib level → OHLC (weak/strong) → free.
- Visual snap glyph and a `Ctrl` override (already the magnet override key).
- Snap only to visible, unlocked objects on the same chart.

### 5.6 Interaction and accessibility
- Arrow nudge (1 px; Shift 10 px) with one undo entry; Alt+arrow moves by bar.
- Tab cycles objects in z-order; Shift+Tab reverses; Enter opens settings.
- `aria-live` announces "Trend line selected, 2 of 7".
- Object tree: search, filter by type, front/back buttons, drag reorder.
- Touch: 44 px handles, long-press opens the context menu, no hover-only action.

### 5.7 Rendering/perf
- Cache projected geometry per drawing keyed by `(timeRange, priceRange, size)`.
- RDP brush simplification; text metrics cache; batch strokes by style.
- Spatial index (bbox) for hit-testing above ~200 objects.
- Target: 500 mixed drawings, pan/zoom at 60 fps on the reference laptop.

---

## 6. Phase 2 — Chart experience parity (1.5–2 weeks)

The keyboard dispatcher, quick command input and source-aware watchlist are a
separate workstream tracked in `MASTERPLAN.md` §26; they land before this
phase so chart actions have one predictable key path.

1. **Chart types** — columns, high-low, line break, range; then tick/footprint
   only when the data adapter can prove tick/depth coverage.
2. **Compare/overlay** — add symbol with percent normalization, ratio and
   spread modes; per-overlay color/scale; legend chips.
3. **Panes** — resize/maximize/reorder indicator panes; per-pane scale; save
   pane heights in the layout.
4. **Alerts 2.0** — indicator-plot source, multi-condition rules, expiry,
   snooze, event log, and rule evaluation independent of the open chart
   (including watchlist symbols); one poller pass.
5. **Replay 2.0** — jump-to-date, step one bar, speed presets, and optional
   paper-order execution against the replay clock; link the replay cursor to the
   journal.
6. **Feed health** — badge each chart/panel with `live | delayed | demo |
   synthetic | stale`, last-tick timestamp and source; never let synthetic depth
   look real.
7. **Keyboard** — user-editable map with conflict detection; keep the existing
   shortcut sheet as the discoverable surface.
8. **Performance** — tick coalescing, incremental indicator append, 100k-bar
   cold-load budget; put the numbers in `docs/` and CI artifacts.

---

## 7. Phase 3 — Pine parity and sandbox (3–5 weeks)

### 7.1 Language
- User-defined functions (single- and multi-line, tuple returns), methods, UDTs,
  `switch`, `for ... in`, line continuations, library imports.
- Correct scoping and call-site state for recursive-looking series usage.

### 7.2 Runtime
- Collections: `array`, `map`, `matrix` with Pine's mutating semantics.
- `request.security`, `request.security_lower_tf`, `lookahead`, nested requests
  with a supplied feed provider; gaps/merging tested.
- Drawings: `label`, `line`, `box`, `table` emitted as structured events to the
  host, with stable handles and create/update/delete deltas.
- Alerts: `alert()`, `alertcondition()`, `alert.freq_*` → the same alert engine.
- Missing built-ins that scripts use daily: `str.*`, `time`/`timestamp`,
  `dayofweek`, `barstate.*`, `syminfo.*`, `session.*`, `math.random`,
  `hline`, `fill`, `plotchar`, `plotarrow`, `plot` offset/display.
- Strategy: commission models (%/cash), slippage ticks, pyramiding, OCA,
  trailing stops, margin/risk rules, intrabar fill assumptions stated in the UI.

### 7.3 Execution and security
- Replace runtime `new Function` with either build-time ESM generation or a
  bytecode VM; drop `unsafe-eval` from the CSP.
- Worker watchdog with a wall-clock cap; compile-time rejection of loops over a
  limit; output caps for drawings/plots/alerts.
- Transfer OHLCV and outputs as typed arrays; avoid cloning the full history per
  run; incremental update for the live bar.

### 7.4 Performance
- Memoize TA at the call site, not by source-array identity plus name/length:
  the current cache misses whenever a series argument is computed per bar. Keep
  rolling buffers and avoid per-bar array copies; benchmark 100k bars and
  publish the number.
- Keep the differential harness: fixed OHLCV fixtures, compare every bar for
  plots, alerts, orders and equity against TradingView exports. Mark each
  feature `implemented | partial | unsupported | verified` in
  `docs/pine-compatibility.md` and in the editor autocomplete.

---

## 8. Phase 4 — Terminal ecosystem and release hardening (2–3 weeks)

1. **Journal = process record.** Pre-trade plans linked to executions,
   playbook rules with adherence stats, local screenshots, MAE/MFE, account-
   aware equity. The strongest reference is Journedge; LuxAlgo's journal shows
   the import→analysis→replay loop.
2. **Options strategy builder.** Multi-leg payoff at expiry and selected dates,
   live Greeks, saved strategies, explicit preview before any order.
3. **Screener workflow.** Formula fields, saved screens, "why it matched",
   open result in chart/compare, alert on screen membership.
4. **Order flow honesty.** Real depth vs synthetic, footprint/CVD, liquidity
   heatmap; label coverage per feed. Do not ship a DOM that looks live when the
   sizes are simulated.
5. **MCP.** Read-only scope by default, per-tool permission, provenance and
   timestamps in results, audit log, explicit approval for mutations. Keep
   trading tools out of the journal/research surface.
6. **Extension model.** Stable interfaces for data adapters, indicators, drawing
   tools and panels; sandbox untrusted code; conformance tests and version
   checks.
7. **Release gates.** Playwright specs for drawing placement, multi-select,
   settings modal, alert-on-drawing and keyboard nudge; visual baselines in a
   pinned container; axe accessibility check on the chart shell; perf artifact;
   signed/checksummed `.deb`; keep `lintian`/`smoke-deb` green.

---

## 9. Priority table

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
| 9 | Object snapping + keyboard nudge | 1 | Precision/accessibility | S–M |
| 10 | Pine UDF + collections | 3 | Script compatibility | L |
| 11 | `request.security` | 3 | Multi-timeframe scripts | L |
| 12 | Pine drawings/alerts | 3 | Plotting parity | L |
| 13 | Remove `new Function` | 3 | Security/CSP | L |
| 14 | Chart types + compare | 2 | Visual parity | M |
| 15 | Indicator/multi-condition alerts | 2 | Alert parity | M |
| 16 | Feed-health badges | 2 | Trust | S |
| 17 | Journal plans/playbooks | 4 | Product differentiation | L |
| 18 | E2E + visual gates | 4 | Regression safety | M |

S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks for one developer familiar with the
tree. Estimates exclude review time.

---

## 10. Research signals (2025–2026 repos)

These are references, not dependencies. All URLs were read in October 2026.

### Drawing / charting
- **deepentropy/lightweight-charts-drawing** — MIT, ~142 stars, active. The
  closest architectural peer: a renderer-neutral drawing core (`kind`,
  time/price points, style/options), one Lightweight Charts primitive for
  drawings/previews/handles/labels, 86 tools, multi-select/group drag, magnet,
  interval visibility, host-owned undo with `gestureEnd`. Borrow the
  core/runtime split and the gesture boundary; its image tool expects a
  host-managed asset store, which matches the Phase 1 plan.
  https://github.com/deepentropy/lightweight-charts-drawing
- **bonguynvan/tradecanvas** — MIT, active, 69 drawing tools, per-tool settings
  schemas, editable defaults, style templates, timeframe visibility,
  drawing-bound alerts, multi-select, named groups, one undo step per compound
  edit, plugin hooks with `priceAt` for alerts. Best product-behaviour reference.
  https://github.com/bonguynvan/tradecanvas
- **marketcalls/openalgo-charts** — Apache-2.0, 87 drawing tools, headless
  `DrawingController`, Objects dock, drawing alerts, undo/redo, drawing-tool
  search for mobile. Useful for the controller/UI split and touch sizing.
  https://github.com/marketcalls/openalgo-charts
- **dylanpersonguy/OpenCharts** — MIT, 175 stars, active. Terminal integration
  reference (adapter contract, panel composition, weak/strong magnet, object
  tree) but a smaller tool suite and Lightweight Charts 4.x.
  https://github.com/dylanpersonguy/OpenCharts
- **tradingview/lightweight-charts** — the substrate; plugin examples show
  primitive patterns but no drawing manager. Apache-2.0 attribution applies.
  https://github.com/tradingview/lightweight-charts

### Terminal features
- **TradeCanvas** — linked grids up to 6 charts, replay/backtesting, draggable
  orders, paper/custom broker, WebGL path for large histories.
- **OpenTerminalUI** — multi-pane workstations, replay/compare, screener,
  fundamentals, filings with citations, options builder, alerts, plugins, MCP.
- **FlowMap** — Tauri + Python sidecar + WebGL2, Parquet replay, DOM/tape/CVD,
  feed-health/capability badges, performance HUD. The badge model is worth
  copying for Phase 2.
- **EdgeDepth Terminal** — footprint/liquidity heatmap/volume profile, explicit
  "no live execution" boundary. Good honesty model.
- **OpenAlgo Desktop** — Tauri 2, broker adapters, sandbox mode, keyboard-first
  scalping, options tools; release notes emphasize order-state safety.
- **HyperData Terminal** — labels feeds LIVE/PARTIAL/STALE/DRIFT, separates
  confirmed from estimated events, read-only MCP. Direct input for the
  feed-health work.

### Pine
- **LuxAlgo/PineTS** — v5/v6, UDFs, arrays/maps/matrices, `request.security` and
  `security_lower_tf`, label/line/box/table, alerts, strategy commission/
  slippage/pyramiding. The closest JS-native comparison to this transpiler.
  https://github.com/LuxAlgo/PineTS
- **nullarch/resin** — v5/v6 compiler with UDTs/methods, collections, nested
  requests, a substantial broker emulator (pyramiding, commission, slippage,
  OCA, margin calls, bar magnifier) and explicit TradingView differential
  testing. The best model for Phase 0.2/7.2.
  https://github.com/nullarch/resin
- **Opus-Aether-AI/pine-transpiler** — v5/v6, UDFs/methods/UDTs, arrays/maps,
  subset `request.security`, drawing events, but no strategies; documents a
  non-eval standalone ESM factory for strict CSP. Relevant to Phase 3.3.
  https://github.com/Opus-Aether-AI/pine-transpiler
- **be-thomas/OpenPineScript** — v1–v5, UDTs/methods/libraries, arrays/matrices/
  maps, `security()`, broker emulator, 2,396 tests. Good fixture ideas.
- **pynesys/pynecore** — v4–v6 semantics, full collections, security/alerts,
  broad strategy rules, large compatibility matrix.
- **ferranbt/pinecone** — Rust interpreter with reusable series buffers;
  a reference for avoiding per-bar allocation.
- **woodstock-tokyo/pinescription** — bytecode VM, arrays/matrices, custom
  alert sinks; reports 164× over full recompute on a Bollinger benchmark.
- **pineforge-4pass/pineforge-engine** — Pine→C++ and extensive comparison
  results; the compiler has separate licensing, so treat it as a benchmark, not
  a drop-in.

### Journal / AI / MCP
- **TheQuantum-Dev/journedge** — local SQLite, account-scoped trades, idempotent
  imports, local screenshots, pre-trade plans linked to executions, playbook
  adherence, MAE/MFE. The clearest Phase 4 blueprint.
- **Eleven-Trading/TradeNote** — self-hosted, broker export imports, timezone-
  aware journal.
- **hugodemenez/deltalytix** — futures/prop-firm imports and AI coaching; check
  its CC BY-NC licence before reusing code.
- **LuxAlgo/trade-journal** — 16 statement formats, generic CSV mapper, FIFO/
  LIFO/weighted-average, playbooks, prop cash, replay.
- **tradesdontlie/tradingview-mcp**, **tedorigawa001/TradingView-MCP** — chart
  snapshots, indicator values, replay controls and structured evidence; both
  depend on TradingView Desktop debugging, so use the contract, not the bridge.
- **options-chain-mcp**, **MaverickMCP** — read-only, server-side filtering,
  explicit "does not place orders"; good scope model for EzyView's MCP.

---

## 11. Non-goals / cautions

- Do not copy TradingView's proprietary bundle or Pine runtime. Reimplement
  public language behaviour from docs and fixtures.
- Do not equate tool count with parity. `egui-charts` lists 98 tools but its own
  README says magnet snapping is not applied and some tools are placeholders.
- Do not claim "full Pine v6" until the differential matrix exists. Resin's own
  README warns that compiling/running is not numerical correctness.
- Do not add image/pattern tools before the schema migration and storage caps:
  both turn a style bug into data loss.
- Keep Lightweight Charts' Apache-2.0 attribution visible.

---

## 12. Suggested first slice

If only one week is available: Phase 0.1 + 0.3 + 0.5, then P1 multi-select
model and the pitchfork pack. That sequence fixes silent data bugs, unlocks
alert-on-drawing (a headline TradingView feature), and proves the new tool
pipeline with one high-value family before committing to eight more.
