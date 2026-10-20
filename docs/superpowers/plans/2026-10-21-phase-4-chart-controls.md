# Phase 4 — Chart Controls & Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship crosshair modes/sync, price-scale modes, timezone, watermark, Tokyo Night theme, replay speed, larger grids, and layout sort — free, unlimited, no paywall.

**Architecture:** Chart settings live on `ChartState` (per cell) and `WorkspaceStore` (app-wide: theme, crosshair sync). `EzyChart` gains setters for crosshair mode, price-scale mode, invert, timezone, watermark. Toolbar View menu hosts the new toggles. Layout manager sorts tabs.

**Tech Stack:** React 19, Zustand, Lightweight Charts v5, oxlint/vitest/tsc/vite.

**Spec:** `docs/MEGA-PLAN.md` Phase 4; `MASTERPLAN.md` §12 Phase 4 + §15.

## Global Constraints

- Unlimited layouts; no paywall strings.
- Every chart setting must survive reload via existing persist path.
- Crosshair sync only across cells of the **active layout**, not across windows.
- Tokyo Night palette: bg `#1a1b26`, panel `#24283b`, text `#c0caf5`, grid `#292e42`, up `#9ece6a`, down `#f7768e`, accent stays `#2962ff`.
- Replay speed: `0.5 | 1 | 2 | 4` × (default 500ms/bar).
- Grid modes gain `"6"` (3×2) and `"9"` (3×3).
- Browser smoke deferred to end of all phases (user request).

## Review Focus

- Crosshair sync must not recurse (A→B→A).
- Price-scale log mode on zero/negative prices must not crash LWC (clamp or fall back to normal).
- Timezone change re-renders time axis without refetching candles.
- Watermark must not intercept pointer events.
- Restoring old persisted layouts (no new fields) must not throw.

---

### Task 1: Chart settings types + store wiring

**Files:**
- Modify: `apps/desktop/src/layout.ts` (ChartState fields, GridMode 6/9)
- Modify: `apps/desktop/src/store.ts` (actions, persist)
- Test: `apps/desktop/src/layout.test.ts`

**Interfaces:**
- Produces: `ChartState.crosshairMode?: "normal" | "magnet" | "hidden"`, `ChartState.priceScale?: "normal" | "log" | "percentage"`, `ChartState.invertScale?: boolean`, `ChartState.timezone?: string`, `ChartState.watermark?: boolean`; `GridMode` includes `"6" | "9"`; store `setChartSetting(patch: Partial<ChartState>)`, `crosshairSync: boolean`, `setCrosshairSync(b: boolean)`, `theme: "dark" | "light" | "tokyo"`, `setTheme(t)`.

- [ ] Extend `ChartState` with optional fields above (default absent = current behaviour).
- [ ] Add grid modes 6 and 9 to `GRID_MODES` + CSS classes in ChartPage.
- [ ] Store: `theme` moves from ChartState-only to workspace-level with Tokyo Night; keep per-cell theme as override optional — use workspace-level for simplicity.
- [ ] Tests: restore old layout JSON without new fields still loads; grid 6/9 cell counts.

### Task 2: EzyChart setters

**Files:**
- Modify: `packages/chart-engine/src/host.ts`
- Modify: `packages/chart-engine/src/theme.ts` (TOKYO_THEME)
- Test: new `packages/chart-engine/src/settings.test.ts` (applyOptions spies or pure option builders)

**Interfaces:**
- Produces: `setCrosshairMode(mode: "normal"|"magnet"|"hidden")`, `setPriceScaleMode(mode: "normal"|"log"|"percentage")`, `setInvertScale(b: boolean)`, `setTimezone(tz: string | null)`, `setWatermark(text: string | null)`, `subscribeCrosshair(cb)` already exists via onCrosshairTime — add `setCrosshairSyncSource` not needed (host app mediates).
- `TOKYO_THEME: ChartTheme`

### Task 3: ChartHost props + effects

**Files:**
- Modify: `apps/desktop/src/ChartHost.tsx`
- Modify: `apps/desktop/src/ChartPage.tsx` (pass props; crosshair time broadcast)

**Interfaces:**
- ChartPage holds `crosshairTimes: (number|null)[]` or single synced time; when sync on, all cells subscribe and apply same time via `chart.setCrosshairTime(t)` if API exists — else only label sync. LWC has `chart.setCrosshair`? Check: use `subscribeCrosshairMove` + `setCrosshair` if available; else document as visual-only readout sync.

### Task 4: Toolbar View menu + Layouts UI

**Files:**
- Modify: `apps/desktop/src/Toolbar.tsx` — Crosshair mode radio, Sync crosshair toggle, Price scale radio, Invert scale, Timezone select (UTC/America/New_York/Europe/London/Tokyo), Watermark toggle, Theme adds Tokyo Night, Grid 6/9.
- Modify: `apps/desktop/src/ReplayBar.tsx` — speed selector 0.5/1/2/4×.
- Modify: `apps/desktop/src/TabBar.tsx` or layouts menu — sort by name / date.

### Task 5: Drawing templates

**Files:**
- Create: `apps/desktop/src/drawingTemplates.ts`
- Modify: `DrawingProperties.tsx` — Save as template / Apply template
- Test: `drawingTemplates.test.ts`

**Interfaces:**
- `saveDrawingTemplate(name, style)`, `listDrawingTemplates()`, `applyDrawingTemplate(id, drawingId)` — localStorage key `ezyview.drawingTemplates`.

### Task 6: Gates + commit

- [ ] `npm run lint && npm run typecheck && npm test && npm run build:web`
- [ ] Commit `feat: Phase 4 chart controls & layouts`
- [ ] Git ops: push, PR, CI, merge, MASTERPLAN update.

## Deviations to record

- Sessions/extended hours: deferred (needs data-adapter session metadata; demo adapter lacks session map).
- Chart templates (full study set snapshot): partial — layout clone already covers this; dedicated template gallery deferred.
- Crosshair sync: implement time+price broadcast; if LWC lacks setCrosshair, sync via shared store value shown in OHLC readout only and note it.
