# Phase 3 — Drawing Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select, edit (drag/move/anchor), delete, lock and reorder drawings on the chart, with undo, properties, line-level alerts, and JSON import/export — the MASTERPLAN §12 Phase 3 scope.

**Architecture:** Pure edit helpers live in `@ezyview/drawing-tools` (unit-tested). Selection is view state on the workspace store (`selectedDrawingId`, not persisted); mutations keep the existing undo model via three store actions (`updateDrawing` undoable, `previewDrawing` silent, `commitDrawingHistory` closes a drag). `ChartHost` wires pointer capture-phase hit-testing against `hitTestAll` when no tool is armed; `DrawingsPrimitive` renders anchor handles for the selected drawing. UI: ObjectTree rows select/lock; a properties panel below the tree edits style/text/z-order and can arm a price alert bound to a horizontal line.

**Tech Stack:** React 19 + Zustand store; Lightweight Charts v5 custom primitive (`IPanePrimitive`); `@ezyview/drawing-tools` hitTest/magnet/edit; vitest.

**Spec:** `MASTERPLAN.md` §7 (Phase 3 row), §12 (Phase 3 summary), §2.3 (editing UX).

## Global Constraints

- All four gates green before merge: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:web`.
- Undo/redo: every committed mutation pushes exactly one undo entry; drag previews push none until pointerup.
- Detached chart windows (`chartIndex === undefined`) stay inert for drawing tools — no selection/drag there either.
- Persisted workspace shape (`ezyview.workspace` partialize) is unchanged: selection is ephemeral view state.
- TDD: write each failing test first, run it, implement, re-run.
- Commit messages end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Voice: caveman (lite) for user-facing replies; normal English in code, comments, tests, PR bodies.

## Review Focus

1. **Click with no tool armed on empty chart space** — must clear selection and place nothing (today it flashes "Select a drawing tool first"). Owned by Task 4; test: none in jsdom for pointer flow — pinned by browser smoke step in Task 5 plus store test that `selectDrawing(null)` clears.
2. **Drag must not pan/zoom the chart** — LWC pan starts on pointerdown at canvas; capture-phase `stopPropagation` on the container when a drawing is grabbed. Owned by Task 4; pinned by manual smoke (Task 5): drag a line, chart does not move.
3. **Undo after drag = exactly one entry** restoring the pre-drag geometry; preview phase pushes nothing. Owned by Task 2; tests `previewDrawing does not push undo`, `commitDrawingHistory makes one undo restore pre-drag state`.
4. **Delete/Backspace while typing in an input, rename field or Monaco must not delete a drawing.** Owned by Task 4; guard on `e.target` being an editable element (same guard as existing Escape handler in ChartPage).
5. **Binding alerts follow their horizontal line** — moving the line updates the alert price; deleting the line removes the alert. Owned by Task 2; tests `move horizontal line updates bound alert`, `deleteDrawing removes bound alerts`.

---

### Task 1: Pure drawing edit helpers

**Files:**
- Create: `packages/drawing-tools/src/edit.ts`
- Create: `packages/drawing-tools/src/edit.test.ts`
- Modify: `packages/drawing-tools/src/index.ts` (export the two helpers)

**Interfaces:**
- Consumes: `Drawing`, `Point` from `./types.js`.
- Produces (used by Task 4's drag logic):
  - `setAnchor(d: Drawing, index: number, pt: Point): Drawing` — returns a copy with `points[index]` replaced; out-of-range index returns `d` unchanged.
  - `translateDrawing(d: Drawing, dTime: number, dPrice: number): Drawing` — returns a copy with every point shifted by `dPrice`, and by `dTime` seconds (all app times are epoch-second numbers).

- [ ] **Step 1: Write failing tests**

```ts
// packages/drawing-tools/src/edit.test.ts
import { describe, expect, it } from "vitest";
import { setAnchor, translateDrawing } from "./edit.js";
import { DEFAULT_DRAWING_STYLE, type Drawing, type Point } from "./types.js";

const base: Drawing = {
  id: "d1",
  tool: "trend_line",
  points: [{ time: 100, price: 10 }, { time: 200, price: 20 }],
  style: { ...DEFAULT_DRAWING_STYLE },
};

describe("setAnchor", () => {
  it("replaces one point and leaves the rest", () => {
    const next = setAnchor(base, 1, { time: 210, price: 25 });
    expect(next.points).toEqual([{ time: 100, price: 10 }, { time: 210, price: 25 }]);
    expect(base.points[1]).toEqual({ time: 200, price: 20 }); // original untouched
    expect(next.id).toBe(base.id);
    expect(next.tool).toBe(base.tool);
  });
  it("returns the same drawing for an out-of-range index", () => {
    expect(setAnchor(base, 5, { time: 1, price: 1 })).toBe(base);
  });
});

describe("translateDrawing", () => {
  it("shifts every point by the deltas", () => {
    const next = translateDrawing(base, 50, -3);
    expect(next.points).toEqual([{ time: 150, price: 7 }, { time: 250, price: 17 }]);
    expect(base.points[0]).toEqual({ time: 100, price: 10 });
  });
  it("keeps style, text, lock and name", () => {
    const named: Drawing = { ...base, name: "My line", locked: true, text: "hi" };
    const next = translateDrawing(named, 1, 1);
    expect(next.name).toBe("My line");
    expect(next.locked).toBe(true);
    expect(next.text).toBe("hi");
    expect(next.style).toEqual(base.style);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/drawing-tools && npx vitest run src/edit.test.ts`
Expected: FAIL — `Cannot find module './edit.js'`

- [ ] **Step 3: Implement `setAnchor` and `translateDrawing` in `packages/drawing-tools/src/edit.ts`**

Both return `{ ...d, points: ... }` (immutability; the store compares nothing, undo snapshots rely on fresh arrays). Export from `index.ts` alongside existing exports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/drawing-tools && npx vitest run src/edit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/drawing-tools/src/edit.ts packages/drawing-tools/src/edit.test.ts packages/drawing-tools/src/index.ts
git commit -m "feat(drawing-tools): pure setAnchor/translateDrawing edit helpers

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Store — selection, undo model, delete, alert binding, import

**Files:**
- Modify: `apps/desktop/src/store.ts`
- Test: `apps/desktop/src/store.test.ts`

**Interfaces:**
- Consumes: `setDrawings` undo shape at store.ts:281–288 (`drawingUndo` entries `{drawings, chartIndex}`), `addAlert`/`removeAlert` actions, `Drawing` from `@ezyview/drawing-tools`.
- Produces (used by Tasks 3–5):
  - `selectedDrawingId: string | null` (view state, **not** persisted)
  - `selectDrawing(id: string | null): void`
  - `deleteDrawing(id: string): void` — removes from active chart, pushes one undo entry, clears selection if it pointed at `id`, removes price alerts whose `drawingId` is `id`
  - `updateDrawing(id, patch)` — **changed**: pushes one undo entry before applying the patch; if the patch moves a `horizontal_line`'s points and an alert has `drawingId === id`, sync that alert's `condition.value` to the new first-point price
  - `previewDrawing(id: string, patch: Partial<Drawing>): void` — apply patch with **no** undo push (drag phase); same alert sync as update
  - `commitDrawingHistory(previous: readonly Drawing[], chartIndex?: number): void` — push `{drawings: [...previous], chartIndex}` onto `drawingUndo`, clear `drawingRedo` (drag end)
  - `importDrawings(list: readonly Drawing[], chartIndex?: number): void` — append with fresh `id: newId()` each, via the `setDrawings` path (one undo entry)
- Also: `PriceAlert` gains optional `drawingId?: string` (type-only addition in `packages/data-adapters/src/alerts.ts`); `AlertDialog`/`addAlert` callers unaffected (field optional).

- [ ] **Step 1: Write failing tests** (append to `apps/desktop/src/store.test.ts`, following existing setup/teardown helpers in that file)

```ts
describe("drawing selection and editing", () => {
  // setup: a layout whose active chart has drawings [{id:"a", tool:"horizontal_line",
  // points:[{time:100, price:50}], style:DEFAULT}, {id:"b", tool:"trend_line", ...}]

  it("selectDrawing sets and clears selection", () => {
    useWorkspace.getState().selectDrawing("a");
    expect(useWorkspace.getState().selectedDrawingId).toBe("a");
    useWorkspace.getState().selectDrawing(null);
    expect(useWorkspace.getState().selectedDrawingId).toBeNull();
  });

  it("deleteDrawing removes it, pushes one undo entry, clears selection", () => {
    useWorkspace.getState().selectDrawing("a");
    useWorkspace.getState().deleteDrawing("a");
    const s = useWorkspace.getState();
    expect(s.activeChart().drawings.map((d) => d.id)).toEqual(["b"]);
    expect(s.selectedDrawingId).toBeNull();
    s.undoDrawing();
    expect(useWorkspace.getState().activeChart().drawings.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("updateDrawing pushes one undo entry", () => {
    useWorkspace.getState().updateDrawing("b", { name: "renamed" });
    const s = useWorkspace.getState();
    expect(s.activeChart().drawings.find((d) => d.id === "b")?.name).toBe("renamed");
    s.undoDrawing();
    expect(useWorkspace.getState().activeChart().drawings.find((d) => d.id === "b")?.name).toBeUndefined();
  });

  it("previewDrawing applies without undo; commitDrawingHistory closes the drag", () => {
    useWorkspace.getState().setDrawings(
      useWorkspace.getState().activeChart().drawings.map((d) => (d.id === "b" ? { ...d, points: [{ time: 1, price: 1 }] : d)),
    ); // known baseline; clears prior undo noise in this test
    const before = useWorkspace.getState().activeChart().drawings;
    useWorkspace.getState().previewDrawing("b", { points: [{ time: 2, price: 2 }] });
    expect(useWorkspace.getState().activeChart().drawings.find((d) => d.id === "b")?.points[0]).toEqual({ time: 2, price: 2 });
    useWorkspace.getState().commitDrawingHistory(before);
    useWorkspace.getState().undoDrawing(); // exactly one undo ⇒ back to `before`
    expect(useWorkspace.getState().activeChart().drawings.find((d) => d.id === "b")?.points[0]).toEqual({ time: 1, price: 1 });
  });

  it("moving a horizontal line updates the price of its bound alert", () => {
    useWorkspace.getState().addAlert({
      symbol: "TEST", message: "bound", condition: { kind: "crossing", value: 50 },
      frequency: "once_per_bar_close", drawingId: "a",
    });
    useWorkspace.getState().updateDrawing("a", { points: [{ time: 100, price: 61 }] });
    const alert = useWorkspace.getState().alerts.find((x) => x.drawingId === "a");
    expect(alert?.condition).toEqual({ kind: "crossing", value: 61 });
  });

  it("deleteDrawing removes alerts bound to the drawing", () => {
    useWorkspace.getState().deleteDrawing("a");
    expect(useWorkspace.getState().alerts.some((x) => x.drawingId === "a")).toBe(false);
  });

  it("importDrawings appends with fresh ids and one undo entry", () => {
    const n0 = useWorkspace.getState().activeChart().drawings.length;
    useWorkspace.getState().importDrawings([
      { id: "a", tool: "horizontal_line", points: [{ time: 5, price: 5 }], style: { color: "#fff", width: 1, lineStyle: "solid" } },
    ]);
    const s = useWorkspace.getState();
    expect(s.activeChart().drawings.length).toBe(n0 + 1);
    expect(s.activeChart().drawings.at(-1)?.id).not.toBe("a"); // remapped
    s.undoDrawing();
    expect(useWorkspace.getState().activeChart().drawings.length).toBe(n0);
  });
});
```

(Adjust to the file's existing helpers — if `store.test.ts` has a `freshStore()`/seed pattern, reuse it; assertions above are the contract.)

`addAlert` signature: match the existing action (read store.ts:~343 area); the test passes the fields `PriceAlert` requires plus `drawingId`; if `addAlert` requires more fields (e.g. derives `id`/`createdAt`), pass exactly what it needs.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- store.test`
Expected: FAIL — `selectDrawing is not a function` (and siblings)

- [ ] **Step 3: Implement in `apps/desktop/src/store.ts`**

- Add `selectedDrawingId: string | null` initial `null` + `selectDrawing`.
- `deleteDrawing`: read active chart's drawings, filter, run through the same code path as `setDrawings` (reuse: call internal `setDrawings(filtered)`), clear selection, `removeAlert` for every alert with `drawingId === id`.
- `updateDrawing`: before applying patch, push `{drawings: currentDrawings, chartIndex: focusedChart}` exactly like `setDrawings` does (store.ts:281–288); after apply, if the drawing is a `horizontal_line` and an alert carries `drawingId === id`, update that alert's `condition.value` when the patch contains `points`.
- `previewDrawing`: same map as `updateDrawing` minus undo push; same alert sync.
- `commitDrawingHistory(previous, chartIndex?)`: `drawingUndo.push({drawings: [...previous], chartIndex: chartIndex ?? layout.activeChart})`, `drawingRedo = []`.
- `importDrawings`: `setDrawings([...current, ...list.map((d) => ({ ...d, id: newId() }))], chartIndex)`.
- `packages/data-adapters/src/alerts.ts`: add `drawingId?: string` to `PriceAlert`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- store.test`
Expected: PASS (new + existing)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/store.ts apps/desktop/src/store.test.ts packages/data-adapters/src/alerts.ts
git commit -m "feat(desktop): drawing selection, undoable edits, bound alerts, import

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Engine — selection handles + pan control

**Files:**
- Modify: `packages/chart-engine/src/drawings.ts` (`DrawingsPrimitive`)
- Modify: `packages/chart-engine/src/host.ts` (`EzyChart`)

**Interfaces:**
- Consumes: `DrawingsPrimitive.project()/render()` internals; `EzyChart` private `chart: IChartApi`, `panes`/primitive registration for drawings.
- Produces (used by Task 4):
  - `EzyChart.setSelection(id: string | null): void` — forwards to the drawings primitive
  - `EzyChart.setPanEnabled(enabled: boolean): void` — `this.chart.applyOptions({ handleScroll: enabled, handleScale: enabled })`
  - `DrawingsPrimitive.setSelection(id: string | null): void`; in `render()`, after drawing the selected one, draw 6×6 px white-filled, dark-bordered squares at each projected anchor.

- [ ] **Step 1: Implement selection rendering in `packages/chart-engine/src/drawings.ts`**

Add private `selectedId: string | null` + `setSelection()`. In `render(target)`, collect and draw handles for `d.id === this.selectedId` after the body (same pane target, `zOrder` stays "top"). Handle position comes from the same projection the body uses.

- [ ] **Step 2: Implement `setSelection` / `setPanEnabled` on `EzyChart` in `packages/chart-engine/src/host.ts`**

`setSelection` holds the drawings-primitive reference (wherever `setDrawings` at :623 reaches it) and forwards. `setPanEnabled` applies `handleScroll`/`handleScale`.

- [ ] **Step 3: Verify with existing engine tests + typecheck**

Run: `npm test -- chart-engine && npm run typecheck`
Expected: PASS

(Canvas rendering is not unit-tested in this repo; the primitive is covered by Task 5 smoke.)

- [ ] **Step 4: Commit**

```bash
git add packages/chart-engine/src/drawings.ts packages/chart-engine/src/host.ts
git commit -m "feat(chart-engine): selection handles + pan/scale toggle on EzyChart

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Interaction — click-select, pointer drag, Delete key

**Files:**
- Modify: `apps/desktop/src/ChartHost.tsx`
- Modify: `apps/desktop/src/ChartPage.tsx` (keydown)

**Interfaces:**
- Consumes: `hitTestAll(layers, click, tol?)` (`@ezyview/drawing-tools`), `setAnchor`/`translateDrawing` (Task 1), store actions (Task 2), `EzyChart.setSelection/setPanEnabled` + `projectDrawing`/`screenToTimePrice` (Task 3, host.ts:639–656), `snapToOhlc` when `magnet !== "off"`.
- Produces: user-visible select-on-click, drag anchors/body, Delete removes selection — Task 5 smoke verifies.

- [ ] **Step 1: Extend the `onClick` handler (ChartHost.tsx:75–116)**

When `activeTool === null` and `chartIndex !== undefined`:
- project every drawing (`chart.projectDrawing(d)`), `hitTestAll` with the click `{x, y}`.
- hit → `selectDrawing(hit.id)`; miss → `selectDrawing(null)`.
- Replace the "Select a drawing tool first" flash for this case (flash stays for armed-tool degenerate clicks only if it still applies — with a tool armed the placement path runs, so the no-tool flash becomes the select path).
- After any selection change call `chart.setSelection(selectedIdOrNull)` (also on miss → `setSelection(null)`).

- [ ] **Step 2: Pointer capture-phase drag on the container (ChartHost.tsx)**

Attach with `useEffect` on `containerRef` (capture `true`):

- `pointerdown`: guard `chartIndex === undefined || activeTool !== null` → return. Compute pixel point from `getBoundingClientRect`; if magnet mode on, snap the *hit test* point? No — hit test uses raw pixel; snap applies to resulting time/price after `screenToTimePrice`. Hit-test via `hitTestAll`. Miss → return (let LWC handle pan/zoom and the later click deselect). Hit → `e.stopPropagation()` (LWC never sees down → no pan), `selectDrawing(id)`, `chart.setSelection(id)`; if drawing `locked` → select only, no drag state. Else start drag ref: `{ id, handle, snapshot: [...activeChart().drawings], startPoint: screenToTimePrice(pt), moved: false }`, `containerRef.setPointerCapture(e.pointerId)`, `chart.setPanEnabled(false)`.
- `pointermove`: if no drag ref → return. Compute pt = `screenToTimePrice`; magnet on → `snapToOhlc(pt, bars, magnet)` for anchor moves. If `handle >= 0` → `setAnchor(d, handle, snappedPt)`; else → `translateDrawing(d, pt.time - startPoint.time, pt.price - startPoint.price)` applied to the **snapshot** copy (avoids compounding). `previewDrawing(id, { points: next.points })`, `moved = true`, `e.preventDefault()`.
- `pointerup`/`pointercancel`: if drag ref → `setPanEnabled(true)`; if `moved` → `commitDrawingHistory(snapshot, chartIndex)`; clear ref. (`handle` here is the hit-test handle: `0..n-1` anchor, `-1` body.)

Beware: the existing `onClick` debounced placement path must not fire after a drag — placement only runs when a tool is armed, drag only when disarmed, so they are already disjoint. Selection re-run on the subsequent click is a harmless no-op reselect.

- [ ] **Step 3: Delete/Backspace in `ChartPage.tsx` keydown**

Find the existing Escape/global key handler; in the same handler: on `Delete`/`Backspace`, if `selectedDrawingId` set and `e.target` is not an input/textarea/contentEditable (same guard style as existing handler), call `deleteDrawing(id)`. Escape already disarms tools; also `selectDrawing(null)` + `setSelection(null)` on Escape when no tool armed? Keep scope tight: Escape clears selection too (one line, natural UX).

- [ ] **Step 4: Gates (fast subset)**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/ChartHost.tsx apps/desktop/src/ChartPage.tsx
git commit -m "feat(desktop): select/drag/delete drawings from the chart

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: UI — object tree select/lock, properties panel, import/export

**Files:**
- Create: `apps/desktop/src/DrawingProperties.tsx`
- Create: `apps/desktop/src/drawingsIO.ts`
- Create: `apps/desktop/src/drawingsIO.test.ts`
- Modify: `apps/desktop/src/ObjectTree.tsx`
- Modify: `apps/desktop/src/RightRail.tsx` (only if ObjectTree is mounted there — wire whichever host renders ObjectTree)

**Interfaces:**
- Consumes: store actions (Task 2), `toolName`/`drawingLabel` (ObjectTree.tsx:13–18), `addAlert` for the alert button, `newId` from store for ids.
- Produces:
  - `serializeDrawings(drawings: readonly Drawing[]): string` — `{ version: 1, drawings }` JSON, pretty-printed
  - `parseDrawings(json: string): { ok: true; drawings: Drawing[] } | { ok: false; error: string }` — rejects non-arrays, non-object entries, missing `id`/`tool` strings, non-finite point times/prices, bad `style`; keeps unknown extra fields
  - `<DrawingProperties />` — reads `selectedDrawingId` from the store; renders nothing when null

- [ ] **Step 1: Write failing tests for `drawingsIO`**

```ts
// apps/desktop/src/drawingsIO.test.ts
import { describe, expect, it } from "vitest";
import { parseDrawings, serializeDrawings } from "./drawingsIO";
import { DEFAULT_DRAWING_STYLE, type Drawing } from "@ezyview/drawing-tools";

const d: Drawing = {
  id: "x", tool: "horizontal_line",
  points: [{ time: 1, price: 2 }], style: { ...DEFAULT_DRAWING_STYLE },
  locked: true, name: "Level",
};

describe("drawingsIO", () => {
  it("round-trips", () => {
    const parsed = parseDrawings(serializeDrawings([d]));
    expect(parsed).toEqual({ ok: true, drawings: [d] });
  });
  it("rejects garbage", () => {
    expect(parseDrawings("not json").ok).toBe(false);
    expect(parseDrawings('{"drawings": 1}').ok).toBe(false);
    expect(parseDrawings('{"drawings":[{"id":1}]}').ok).toBe(false);
    expect(parseDrawings('{"drawings":[{"id":"a","tool":"trend_line","points":[{"time":"x","price":1}],"style":{}}]}').ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail, implement `drawingsIO.ts`, re-run to pass**

Run: `npm test -- drawingsIO`
Expected: FAIL then PASS. Validation mirrors `TOOL_ANCHORS` membership if that const is exported (it is — `types.ts:74`); unknown tool → reject.

- [ ] **Step 3: ObjectTree — select + lock (ObjectTree.tsx:74–86 + Row)**

- Drawing rows: clicking the row (label area) calls `selectDrawing(d.id)`; selected row gets `bg-ev-raised` + `ring-1 ring-ev-accent` and `aria-selected`.
- New lock button per row (lucide `Lock`/`LockOpen`): `updateDrawing(d.id, { locked: !d.locked })`.
- Below the tree, when `selectedDrawingId` is set: render `<DrawingProperties />`.

- [ ] **Step 4: `DrawingProperties.tsx`**

Sections (store-driven, every edit via `updateDrawing` so undo works):
- Rename input (bound to `d.name`).
- Colour swatches: `["#2962ff","#f23645","#ff9800","#4caf50","#9c27b0","#00bcd4","#ffd700","#ffffff"]` → `style.color`.
- Width: buttons 1/2/3/4 → `style.width`. Line style: solid/dashed/dotted → `style.lineStyle`.
- Text field when `d.tool === "text"` or `d.text !== undefined` → `d.text`.
- Lock checkbox (mirrors row lock), hidden toggle (mirrors row eye).
- Z-order: "Bring to front" / "Send to back" — reorder via `setDrawings` (front: move to end; back: move to start) so undo works.
- "Alert at level" — enabled when `d.points[0]` finite and tool is `horizontal_line`: `addAlert({ symbol: activeChart().symbol, message: \`${drawingLabel(d)} @ ${price}\`, condition: { kind: "crossing", value: price }, frequency: "once_per_bar_close", drawingId: d.id })` (field names to match `PriceAlert`/`addAlert` exactly; read store + AlertDialog usage at implementation time).
- Delete button → `deleteDrawing(d.id)`.

- [ ] **Step 5: Import/export footer in ObjectTree**

- Header area: "Export" button → `URL.createObjectURL(new Blob([serializeDrawings(chart.drawings)], {type:"application/json"}))` + temporary `<a download="drawings-<symbol>.json">` click. Disabled when no drawings.
- "Import" button → hidden `<input type="file" accept="application/json">` → `parseDrawings` → on ok `importDrawings(drawings)`; on error set a local error line under the footer (no toast infra — keep inline).
- Keep footer visually consistent with the panel (border-t, `text-[11px]`).

- [ ] **Step 6: Full gates**

Run: `npm run lint && npm run typecheck && npm test && npm run build:web`
Expected: all PASS (fix anything surfaced; chunk-size warning is pre-existing and acceptable)

- [ ] **Step 7: Browser smoke (manual, via Chrome MCP against `npm run dev`)**

1. Place a trend line (tool → two clicks). 2. Click empty space → deselected (handles gone). 3. Click the line → selected, handles visible, properties panel appears. 4. Drag body → moves, chart does NOT pan. 5. Drag an anchor → endpoint moves. 6. Change colour/width → visible; Ctrl+Z/undo button restores. 7. Delete key → gone; undo restores. 8. Lock → drag does nothing. 9. ObjectTree row click selects; lock/eye/rename work. 10. "Alert at level" on horizontal line → appears in Alerts dialog; move line → alert price follows. 11. Export → downloads JSON; Import → re-adds with new ids. 12. Magnet on → anchor drag snaps to OHLC.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/DrawingProperties.tsx apps/desktop/src/drawingsIO.ts apps/desktop/src/drawingsIO.test.ts apps/desktop/src/ObjectTree.tsx apps/desktop/src/RightRail.tsx
git commit -m "feat(desktop): drawing properties, object-tree selection, JSON import/export

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Git ops — PR, CI, merge, MASTERPLAN update

- [ ] **Step 1:** Push with sandbox bypass: `git push -u origin feat/phase-3-drawing-parity` (`dangerouslyDisableSandbox: true`).
- [ ] **Step 2:** Open PR via GitHub MCP: title `feat: Phase 3 drawing parity`, body = this plan's summary + test counts + gate results, ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3:** Watch CI (`get_check_runs`) until green; fix-forward on failure.
- [ ] **Step 4:** Merge (squash) without asking — standing authorization.
- [ ] **Step 5:** Update `MASTERPLAN.md` §7 Phase 3 row → `done`, PR number in the reference column; §12 note any deviation (multi-select shift-click deferred; trend-line-angle alerts deferred — horizontal-line binding only). Push as a follow-up commit on the same branch before merge if still open, else a tiny docs PR.

## Deviations (recorded for the final report)

- Multi-select (shift/ctrl-click) — **deferred**, single selection only.
- Angle-following alerts on trend lines — **deferred**; horizontal-line level binding implemented.
