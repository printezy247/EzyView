# Phase 0 — Drawing/Chart-Control Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make drawing placement deterministic (ghost anchor, `finally` cleanup, duplicate-click guard, invalid-click feedback, `screenToTimePrice` validity helper), add undo/redo with keyboard shortcuts, and ship the `ChartCommandInput` quick-switch overlay.

**Architecture:** Three layers. (1) `EzyChart` gains a validated `screenToTimePrice` helper plus debug counters. (2) `ChartHost` onClick is rewritten with a `drawingInProgress` guard, immediate ghost anchor, `finally` cleanup, and invalid-click flash. (3) Zustand store gains undo/redo stacks; a new `ChartCommandInput` overlay drives symbol/timeframe/command switching.

**Tech Stack:** TypeScript, React 19, Zustand 5, Lightweight Charts v5, Vitest 3.2, Tauri v2 desktop.

**Spec:** `MASTERPLAN.md` §9, §14, §15.

## Global Constraints

- No new runtime deps; reuse existing packages.
- Vitest env is `node` (no jsdom): component logic must be testable via extracted pure helpers; React rendering is smoke-tested by `tsc`/build only.
- All edits must keep `npm run typecheck`, `npm run lint`, `npm run test` green.
- Undo/redo must restore drawing arrays byte-for-byte (structuredClone equality).
- `screenToTimePrice` must never return non-finite numbers; reason is non-null iff `ok` is false.

## Review Focus

- `screenToTimePrice` called with NaN/Infinity/out-of-bounds must report `ok:false` with a reason, never throw.
- A single physical click must not produce two anchors (debounce + in-progress flag).
- Undo then redo must reproduce the exact prior drawings array (deep equality).
- Command input applies a symbol/timeframe change without a full page reload.
- Ctrl+K conflict between feature palette and command input resolved in favour of command input (locked decision §1.3).

---

### Task 1: `screenToTimePrice` validity helper in `EzyChart`

**Files:**
- Modify: `packages/chart-engine/src/host.ts` (add method + debug fields + subscribeClick refactor)
- Test: `packages/chart-engine/src/host.test.ts` (new, pure-helper unit tests where possible)

**Interfaces:**
- Produces: `EzyChart.screenToTimePrice(x, y): { ok: boolean; time: number | null; price: number | null; reason: string | null }`, public fields `clickCount: number`, `lastClick: { x: number; y: number; t: number } | null`.

- [ ] **Step 1: Add debug fields + method.** Add `clickCount` and `lastClick` private fields initialised in constructor, and a public `screenToTimePrice` method that increments the counter, records `lastClick`, converts via `coordinateToTime`/`coordinateToPrice`, and returns the validated result with reason `"outside chart"` / `"non-finite"` / `null`.
- [ ] **Step 2: Refactor `subscribeClick`** to call `screenToTimePrice` and forward its `time`/`price` to `opts.onClick` (instead of converting inline), so the counter fires once per click.
- [ ] **Step 3: Typecheck + tests.** Run `npm run typecheck`.

---

### Task 2: `ChartHost` onClick reliability (ghost, cleanup, guard, feedback)

**Files:**
- Modify: `apps/desktop/src/ChartHost.tsx`

**Interfaces:**
- Consumes: `EzyChart.screenToTimePrice` (Task 1), `snapToOhlc`, `isComplete`.
- Produces: `drawingInProgress` guard via ref; `ghost` + `flash` local state; `finally`-style cleanup.

- [ ] **Step 1: Add refs/state.** `drawingInProgressRef`, `lastClickAtRef`, `ghost` state, `flash` state.
- [ ] **Step 2: Rewrite `onClick`.** Guard on `drawingInProgress`; debounce 150 ms; call `screenToTimePrice`; on `!ok` set flash and return; snap point; update pending; on first point set ghost; on completion use try/finally to reset pending, clear ghost, clear tool, clear flag; on invalid tool/missing chart set flash.
- [ ] **Step 3: Clear ghost on tool change/escape.** Extend the `activeTool` effect.
- [ ] **Step 4: Render ghost marker + flash hint** in JSX.
- [ ] **Step 5: Typecheck.**

---

### Task 3: Undo/redo in store + keyboard shortcuts

**Files:**
- Modify: `apps/desktop/src/store.ts`
- Modify: `apps/desktop/src/App.tsx` (keyboard shortcuts)
- Modify: `apps/desktop/src/DrawingToolbar.tsx` (wire Undo to store; add Redo)

**Interfaces:**
- Produces: store actions `undoDrawing(): void`, `redoDrawing(): void`; state `drawingUndo: Drawing[][]`, `drawingRedo: Drawing[][]` (not persisted).

- [ ] **Step 1: Add state + actions to `WorkspaceStore` interface.**
- [ ] **Step 2: Implement** stacks with skip-history flag inside `setDrawings`.
- [ ] **Step 3: Wire `DrawingToolbar` Undo → `undoDrawing`, add Redo button when redo non-empty.**
- [ ] **Step 4: Add global keydown** in App.tsx: Ctrl+Z → undo; Ctrl+Y / Ctrl+Shift+Z → redo; guard inputs.
- [ ] **Step 5: Tests** in `apps/desktop/src/store.test.ts` (new) for byte-for-byte undo/redo round-trip.
- [ ] **Step 6: Typecheck + tests.**

---

### Task 4: `ChartCommandInput` overlay

**Files:**
- Create: `apps/desktop/src/ChartCommandInput.tsx`
- Modify: `apps/desktop/src/ChartHost.tsx` (mount overlay, open state, `/` + Ctrl+K triggers)
- Modify: `apps/desktop/src/Toolbar.tsx` (move feature palette to Ctrl+Shift+K)

**Interfaces:**
- Produces: exported pure helpers `TIMEFRAMES`, `parseCommand`, `filterSymbols`; component `ChartCommandInput`.

- [ ] **Step 1: Pure helpers** with unit tests in `apps/desktop/src/ChartCommandInput.test.ts`.
- [ ] **Step 2: Component** with symbol autocomplete, timeframe list, slash commands, recent symbols (localStorage), keyboard nav, apply → onApply.
- [ ] **Step 3: Mount in ChartHost** as overlay; open on `/` or Ctrl+K when focused.
- [ ] **Step 4: Toolbar** moves Ctrl+K to Ctrl+Shift+K for feature palette.
- [ ] **Step 5: Typecheck + tests.**

---

### Task 5: Magnet persistence & tooltip (verify)

**Files:**
- Verify only: `store.ts` partialize already persists `magnet`; `DrawingToolbar` tooltip shows mode.

- [ ] **Step 1: Confirm persisted** via existing restoreWorkspace tests; no code change expected. Add a note in plan only.

---

### Task 6: Git ops (branch, commit, push, PR, CI, merge, report)

- [ ] Run `npm run typecheck && npm run lint && npm run test && npm run build:web`.
- [ ] Commit on `feat/phase-0-drawing-reliability`, push (sandbox bypass), open PR via gh, check CI, merge after green, report.

---

### Review Focus tests to add

- Add tests pinning each Review Focus item to its owning task's test file.
