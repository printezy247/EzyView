# Phase 7 — Pine Editor & Strategy Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pine reaches MASTERPLAN Phase 7 depth: Monaco autocomplete + lint markers, equity-curve readout, parameter optimization over `input.*` knobs, and a versioned shareable script library.

**Architecture:** Pure helpers (completion catalog, lint rules, optimizer) live in `packages/pine-transpiler` with unit tests. `apps/desktop/src/PineEditor.tsx` wires Monaco completion/markers, the equity sparkline, the optimizer panel, and version/share controls. Store (`apps/desktop/src/store.ts`) gains version history (backward-compatible restore) and export/import actions. Run/compile/backtest already exist (Phase 0 scaffold) — this phase deepens, does not replace.

**Tech Stack:** TypeScript, monaco-editor ^0.55.1 (already installed, lazy-loaded), Zustand, Vitest, existing Tailwind tokens. No new npm dependencies.

**Spec:** `MASTERPLAN.md` §2.11, §3.5, §7 row 7, §12 Phase 7; `docs/MEGA-PLAN.md` Phase 7.

## Global Constraints

- Secrets stay in the OS keyring (N/A here — no network).
- All gates per task: `npm run lint`, `npm run typecheck`, `npx vitest run --configLoader runner`. Full `npm run build:web` at phase end.
- Pine target: **v5** (repo resolved v5 now, v6 later). Starter script already `//@version=6`; do not churn the starter — lint rule flags missing version comment only, whatever its number.
- `runPine` populates `ctx.inputs` in place (declaration order or `id` kwarg); optimizer and inputs UI reuse that map — do not invent a second keying scheme.
- No new npm dependencies. Monaco stays lazily loaded (bundle budget).
- Backward compatibility: existing persisted `pineScripts` blobs (no `versions`, no `inputs`) must restore cleanly.

## Review Focus

- Completion provider must degrade gracefully mid-token and must not throw on empty documents; string/comment context best-effort is fine (no AST needed).
- Markers: syntax errors (from `transpile`/`PineSyntaxError`) and lint issues both land as Monaco markers; clearing the error must also clear markers (no stale red squiggles).
- Optimizer: cartesian-product cap (500 combos) enforced and reported via `capped`; results ranked by `totalPnl` desc, ties by fewer trades; runs are synchronous pure functions — no UI state mutation inside the package.
- Versions: save with unchanged source creates no version spam; restore replaces working source without deleting later versions; old blobs without `versions` restore as empty list.
- Sparkline: empty/flat equity arrays must not crash; zero-trade results never reach `StrategyTester` (existing gate) — keep that invariant.

## Tasks

### Task 1: Completion catalog + lint rules (pine-transpiler)
**Files:**
- Create: `packages/pine-transpiler/src/completion.ts`, `packages/pine-transpiler/src/completion.test.ts`, `packages/pine-transpiler/src/lint.ts`, `packages/pine-transpiler/src/lint.test.ts`
- Modify: `packages/pine-transpiler/src/index.ts` (barrel)

**Interfaces (Task 2 consumes):**
- `export interface PineCompletion { label: string; kind: "keyword" | "builtin" | "namespace" | "function"; detail: string; insertText?: string }`
- `export function pineCompletions(): PineCompletion[]` — catalog covering: keywords (`if/else/for/to/by/while/var/return/and/or/not/true/false/na` + type keywords), builtins (`open/high/low/close/volume/hl2/hlc3/ohlc4/bar_index`), namespaces (`ta/math/color/input/strategy/shape/location/size`), functions actually supported by the emitter (`plot/plotshape/bgcolor/indicator/strategy/nz/na/crossover/crossunder` + `ta.*`/`math.*` members present in `runtime.ts`; `input.int/float/bool/string`; `strategy.entry/close/exit/close_all` as supported). Stable order, no duplicates. Static array — no runtime introspection.
- `export interface PineLintIssue { line: number; column: number; message: string; severity: "error" | "warning" }`
- `export function lintPine(source: string): PineLintIssue[]` — deterministic rules, line/column 1-based:
  1. empty/whitespace-only source → error "Empty script" (line 1 col 1).
  2. no `//@version=` anywhere → warning "Missing //@version= comment" (line 1 col 1).
  3. both `indicator(` and `strategy(` declaration calls present → error "Script declares both indicator() and strategy()" at the second occurrence's line.
  4. no `plot(`/`plotshape(`/`strategy.` call at all → warning "Script has no plot or strategy call".
  Implementation: line-based scan with indexOf-per-line; no full parse (transpile errors are a separate channel in Task 2).

- [ ] Step 1: Write failing tests first (catalog contains ta.sma? — only what runtime actually supports; includes namespaces; no dupes; lint rules 1–4 with exact lines/columns; empty source; version present → no warning).
- [ ] Step 2: `npx vitest run --configLoader runner packages/pine-transpiler/src/completion.test.ts packages/pine-transpiler/src/lint.test.ts` — FAIL (module not found).
- [ ] Step 3: Implement + barrel-export.
- [ ] Step 4: Tests pass; `npm run lint` + `npm run typecheck` clean.
- [ ] Step 5: Commit `feat(pine): completion catalog + static lint rules`.

### Task 2: Monaco autocomplete + markers
**Files:**
- Modify: `apps/desktop/src/PineEditor.tsx` (language registration + run/error path)
- Test: none for Monaco wiring (untestable headless) — Task 1 covers the pure inputs; report notes why.

**Interfaces:**
- Consumes: `pineCompletions`, `lintPine` (Task 1); existing `PineSyntaxError` from `transpile` (line info: verify actual error shape in parser; map line/column onto `monaco.editor.setModelMarkers`).
- Produces: none.

- [ ] Step 1: In `registerPineLanguage`, add `monaco.languages.registerCompletionItemProvider("pine", { triggerCharacters: [".", ":"], provideCompletionItems })` mapping `pineCompletions()` to CompletionItems (kind mapping: keyword→Keyword, builtin→Constant, namespace→Module, function→Function; range from word at position; `insertText ?? label`).
- [ ] Step 2: Extract `applyMarkers(monaco, model, issues)` helper; after every `run()` (success or catch) and on debounced content change (~400 ms), set markers from `lintPine(source)` plus transpile syntax error (severity error at its line) via `monaco.editor.setModelMarkers(model, "pine", markers)`; empty array clears.
- [ ] Step 3: Gates clean (full vitest still green — no test regressions).
- [ ] Step 4: Commit `feat(desktop): pine autocomplete + lint markers`.

### Task 3: Equity sparkline + inputs snapshot
**Files:**
- Modify: `apps/desktop/src/PineEditor.tsx` (StrategyTester + run())
- Modify: `apps/desktop/src/store.ts` (`PineScriptRecord.inputs?: Record<string, number | string | boolean>` — snapshot only scalar inputs; persist via existing partial-merge `setPineResult`)
- Modify: `apps/desktop/src/store.test.ts` if present, else new small test for inputs round-trip through save/restore
- Test: store inputs backward-compat (old blob without `inputs` restores; new record persists scalar map)

**Interfaces:**
- Consumes: `ctx.inputs` after `runPine` (mutated in place); existing `StrategyTester` result prop.
- Produces: `PineScriptRecord.inputs?: Record<string, number | string | boolean>` — Task 4 optimizer keys off this.

- [ ] Step 1: Failing store test: save record with `inputs`, restore blob; old blob `{id,name,source,plots,orders,error}` restores with `inputs` undefined.
- [ ] Step 2: `run()` captures scalar entries of `ctx.inputs` into `setPineResult(... inputs)`.
- [ ] Step 3: StrategyTester renders an inline SVG equity polyline (reuse JournalStatsView polyline approach: normalize to viewBox 0..100 x 0..40, stroke `#3fb950`/`#f85149` by final-vs-first) above the metrics row; plus an "Inputs" chip row from `record.inputs` (key=value, skip empty).
- [ ] Step 4: Gates clean.
- [ ] Step 5: Commit `feat(desktop): strategy tester equity curve + inputs snapshot`.

### Task 4: Parameter optimization
**Files:**
- Create: `packages/pine-transpiler/src/optimize.ts`, `packages/pine-transpiler/src/optimize.test.ts`
- Modify: `packages/pine-transpiler/src/index.ts` (barrel)
- Modify: `apps/desktop/src/PineEditor.tsx` (Optimize panel)
- Test: `optimize.test.ts` pure coverage; optional UI-light helper test if extracted (e.g. step-range parser)

**Interfaces:**
- Consumes: `backtest` (existing), `runPine` (desktop side), `record.inputs` (Task 3).
- Produces:
  - `export interface ParamSpec { key: string; values: number[] }`
  - `export interface OptimizeRun { inputs: Record<string, number>; result: BacktestResult }`
  - `export interface OptimizationResult { runs: OptimizeRun[]; best: OptimizeRun | null; capped: boolean }`
  - `export function optimizePine(run: (inputs: Record<string, number>) => BacktestResult, specs: ParamSpec[], opts?: { maxCombos?: number; metric?: (r: BacktestResult) => number }): OptimizationResult` — cartesian product in spec order; default `maxCombos: 500` (stop generating further combos when exceeded, set `capped: true`); default metric `totalPnl`; stable sort desc by metric, ties by fewer trades then by JSON key order; empty specs → single run with `{}`; each combo's `inputs` map contains **only the spec keys** merged over nothing (runner receives exactly spec values — the runner closes over defaults for all other keys).
- Desktop: "Optimize" section under Strategy Tester: for each numeric key in `record.inputs`, a row (key, values text like `10..50 step 10` parsed to `values: number[]`, empty = skip); Run button calls `optimizePine((vals) => backtest(runPine(source, {...baseCtx, inputs: vals}).orders, {close}), specs)`; results table top 10 (netPnl, winRate, PF, key=value summary); "Apply best" button sets inputs for next run (store best vals in component state, merged into the next `run()` ctx.inputs). Disabled with hint when no numeric inputs or bars empty.
- [ ] Step 1: Failing optimize tests: empty specs → one run; 2×3 grid → 6 runs ranked desc; maxCombos cap sets `capped`; custom metric respected; runner receives only spec keys.
- [ ] Step 2: Implement + barrel.
- [ ] Step 3: Desktop panel (parse `start..stop step n` and comma list `1,2,3`; invalid row → skip with hint).
- [ ] Step 4: Gates clean.
- [ ] Step 5: Commit `feat(pine): parameter optimization grid`.

### Task 5: Script library versioning + share
**Files:**
- Modify: `apps/desktop/src/store.ts` (`PineScriptRecord.versions?: PineScriptVersion[]`; `PineScriptVersion { source: string; savedAt: number }` epoch seconds; `savePineScript` prepends a version when source differs from current head, cap 20; new `restorePineScriptVersion(id, index)` replaces `source` in record; backward-compatible restore)
- Modify: `apps/desktop/src/store.test.ts` (version spam guard, cap, restore, old-blob compat)
- Modify: `apps/desktop/src/PineEditor.tsx` (Versions dropdown + Export/Import)
- Create: `apps/desktop/src/pineShare.ts` + `pineShare.test.ts` (pure serializers)

**Interfaces:**
- Consumes: existing `savePineScript`, `deletePineScript`, scripts map.
- Produces:
  - `pineShare.ts`: `exportScriptJson(record: {name: string; source: string}): string` (pretty JSON `{format: "ezyview-pine", version: 1, name, source}`); `parseScriptJson(text: string): { name: string; source: string }` — throws `Error("Not an EzyView Pine script")` on wrong format/version/shape.
  - Store: `restorePineScriptVersion(id: string, index: number): void`; `PineScriptRecord.versions?: PineScriptVersion[]`.
- UI: toolbar gains Versions `<select>` (newest first, "Restore" on change restores that entry into editor + record.source without deleting others), Export (Blob download `name.pine.json` via anchor), Import (hidden file input → `parseScriptJson` → new script id, editor switches to it; parse error → error banner).

- [ ] Step 1: Failing store tests (no-op save same source → versions length unchanged; changed source prepends; cap 20; restore sets source, keeps versions; old blob restores `versions: []` implicitly undefined-ok) + failing pineShare tests (round-trip; rejects garbage and wrong format).
- [ ] Step 2: Implement store + share helpers.
- [ ] Step 3: Wire toolbar UI.
- [ ] Step 4: Gates clean.
- [ ] Step 5: Commit `feat(desktop): pine script versioning + share import/export`.

### Task 6: Gates + docs
- Full gates: `npm run lint`, `npm run typecheck`, `npx vitest run --configLoader runner`, `npm run build:web`.
- MASTERPLAN: §7 row 7 → **done (PR #17)**; §8 add Phase 7 closed line (autocomplete, lint markers, equity curve, optimizer grid, versioned library + JSON share; deferred: walk-forward optimization, publish marketplace, v6); §12 Phase 7 → Done with deviations; known-gaps refresh.
- (Controller runs git usual ops separately.)
