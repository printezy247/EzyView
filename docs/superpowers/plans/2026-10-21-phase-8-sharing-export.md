# Phase 8 — Sharing / export / collaboration (export + share links) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MASTERPLAN Phase 8 export + share surface: chart PNG/SVG/PDF-print/CSV/JSON export, layout share files, share links, copy image/link, and an embed snippet — zero new npm dependencies.

**Architecture:** Pure serializer/builder modules (node-testable) + a thin export bridge that gives the app-level Export menu access to the focused chart cell (capture + candles) + a single Export `<Menu>` in the Toolbar whose entries are reused by the Ctrl+K palette. Downloads default to the existing Blob+anchor idiom; under Tauri they route through the already-registered `dialog` plugin (Rust `save_file` command — no fs plugin needed).

**Tech Stack:** React 19, lightweight-charts v5 (`takeScreenshot()`), zustand, HashRouter, Tauri v2 (`tauri-plugin-dialog` already registered in Rust; frontend `invoke` only), vitest node env.

**Spec:** MASTERPLAN.md §2.10 (share chart image/link, embeddable widget, export CSV/PNG/PDF, copy), §1.4/§2.4 file-export line (CSV/PNG/PDF/image copy, always-ask-where-to-save), §7 row 8, §12 Phase 8 line.

## Global Constraints

- **No new npm dependencies** (all of PNG/SVG/link/embed/CSV/JSON need none; PDF = print-to-PDF raster; dialog via existing Rust plugin).
- Blob + `URL.createObjectURL` + `<a>.click()` + `revokeObjectURL` stays the browser download idiom (precedents: journalCsv caller, drawingsIO caller, pineShare caller).
- Pure serializers get TDD tests (node env, no jsdom — `environment: "node"` in vitest.config.ts). DOM/canvas/clipboard/Tauri paths are guarded (`typeof document === "undefined"` / feature-detect) and verified by typecheck+lint only, stated honestly in reports.
- Gates per task: `npm run lint`, `npm run typecheck`, `npx vitest run --configLoader runner` (plain `vitest run` may fail to load config). Full `npm run build:web` only in the final task.
- One commit per task; no push/PR/merge by implementers; never dispatch subagents.
- Commit messages end `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## Review Focus

1. **PNG capture completeness** — the focused chart is multiple stacked canvases (panes, scales, volume) on `#0e1117`; a capture that grabs only the first canvas or the wrong cell is the likely first bug. Test: compositor takes an explicit container element (no `querySelector` of shared `data-testid` for targeting) and iterates `container.querySelectorAll("canvas")` — pin the canvas-selection rule with a comment + reuse the journal's proven composite logic (extracted, not copied).
2. **CSV RFC-4180 + time format** — headers pinned (`time,open,high,low,close,volume`), CRLF, quoting; timestamps exported as ISO 8601 UTC strings, floats unquoted. Test exact rows including a comma/space-free numeric row and a header.
3. **Share-link hostile input** — `parseShareLink` on arbitrary query strings must never throw: unknown params ignored, symbol uppercased + charset-limited, resolution from a fixed set else default, length cap before parse. Test hostile + missing + oversized inputs.
4. **Clipboard/Tauri guards** — `copyImage` uses `navigator.clipboard.write(new ClipboardItem(...))` which may be absent (Tauri webview, insecure origin): feature-detect, fall back to PNG download, never throw. Similarly `window.print` path. No headless tests — guard code review only.
5. **Dialog fallback** — under Tauri: `invoke("plugin:dialog|save", …)` then Rust `save_file` command; in browser: silent fallback to Blob+anchor. Cancelled dialog must abort cleanly (no empty download). Single `downloadBlob`/`saveBlob` helper owns this so every exporter behaves identically.

---

### Task 1: Export bridge + PNG save (creates the Export menu)

**Files:**
- Create: `apps/desktop/src/exportBridge.ts` (registry), `apps/desktop/src/chartImage.ts` (compositor), `apps/desktop/src/exportUi.ts` (download helpers), `apps/desktop/src/chartImage.test.ts` where pure
- Modify: `packages/chart-engine/src/host.ts` (expose screenshot), `apps/desktop/src/journal.ts` (delegate capture to chartImage), `apps/desktop/src/ChartHost.tsx` (register/unregister bridge), `apps/desktop/src/ChartPage.tsx` (mark focused cell), `apps/desktop/src/Toolbar.tsx` (new `<Menu label="Export">` with first entry), `apps/desktop/src/CommandPalette.tsx` or its groups source (same entries)

**Interfaces (later tasks consume):**
- `exportBridge.ts`: `registerExportSource(id: number, src: ExportSource): () => void` where `ExportSource = { getPng: () => string | null; getCandles: () => readonly Candle[]; meta: () => { symbol: string; resolution: string } }`; `setActiveExportSource(id: number | null): void`; `getActiveExportSource(): ExportSource | null` (null-safe in node).
- `chartImage.ts`: `compositeCanvasesToPng(container: Element, background?: string): string | null` — extracts journal.ts:258-289 logic (all canvases in container, `#0e1117` default bg, `toDataURL("image/png")`, `typeof document === "undefined"` guard). `journal.ts captureChart` becomes a thin delegate (query its testid host, pass element) — **no duplicated composite logic**.
- `exportUi.ts`: `downloadBlob(blob: Blob, filename: string): void` (browser: anchor idiom; Tauri: deferred to Task 6 — for now behaves like anchor, Task 6 upgrades the interior once), `sanitizeExportFilename(name: string, fallback: string): string` (move/generalize `pineExportFilename` from PineEditor.tsx and reuse it there — PineEditor's tests move/adapt or import the shared one).
- `host.ts`: `EzyChart.takeScreenshot(): HTMLCanvasElement | null` delegating to LWC `takeScreenshot()` (typings.d.ts:1767) — bridge `getPng` may use this or the container compositor; pick compositor for parity with journal capture (all layers incl. drawings primitives) and note the LWC API in a comment as the alternative.
- Toolbar: `exportEntries: MenuEntry[]` built in a new `buildExportEntries(api)` (actions only; disabled when `getActiveExportSource()` is null), rendered as `<Menu label="Export">` after `View` (~line 350); the same array feeds the palette groups.

**Steps:**
- [ ] Step 1: Extract compositor + bridge + exportUi with node-safe guards; TDD for `sanitizeExportFilename` (moved cases + journal delegate unchanged behavior — journalCsv-style pin); wire registry in ChartHost mount/unmount + focused flag in ChartPage; host.ts takeScreenshot delegate.
- [ ] Step 2: Export menu with entry **"Save chart image (PNG)"** → `getPng()` (data URL string) → anchor download of the data URL directly (`a.href = dataUrl; a.download = filename`) — no fetch, no Blob conversion; filename `chart-<symbol>-<resolution>.png` via `sanitizeExportFilename`. Disabled when `getActiveExportSource()` is null. Wire the same entry into the palette via the shared `exportEntries` array.
- [ ] Step 3: Gates clean; tests green (journal capture behavior unchanged — existing journal tests still pass).

### Task 2: Chart data CSV + JSON export

**Files:**
- Create: `apps/desktop/src/chartDataExport.ts` + `chartDataExport.test.ts`
- Modify: `apps/desktop/src/Toolbar.tsx` (append 2 entries to `exportEntries`)

**Interfaces:**
- `candlesToCsv(bars: readonly Candle[]): string` — header `time,open,high,low,close,volume`, CRLF row endings, RFC-4180 quoting (mirror `journalCsv.ts` approach), `time` as ISO 8601 UTC (`new Date(time * 1000).toISOString()` — confirm `Candle.time` units against `packages/data-adapters` types in implementation; pin whichever the type says in a test).
- `candlesToJson(bars, meta: { symbol: string; resolution: string }): string` — pretty JSON `{format: "ezyview-chart", version: 1, symbol, resolution, bars}`.
- Both consume `getActiveExportSource().getCandles()` (the replay-visible bars — ChartHost passes `shown`, not `historyRef`).

**Steps:**
- [ ] Step 1: Failing tests — exact CSV (2 bars incl. header, CRLF), empty bars → header only, JSON round-trip parse + format tag.
- [ ] Step 2: Implement; append menu entries **"Export chart data (CSV)"** and **"Export chart data (JSON)"** (filenames `chart-<symbol>.csv` / `.json` via `sanitizeExportFilename`).
- [ ] Step 3: Gates clean.

### Task 3: Layout share file (export + import)

**Files:**
- Create: `apps/desktop/src/layoutShare.ts` + `layoutShare.test.ts`
- Modify: `apps/desktop/src/Toolbar.tsx` (entry), store apply path if none exists (reuse existing layout-create/update action — check `store.ts` for layout setters first; new action only if required), Import entry **"Import layout…"** (file input or `showOpenFilePicker`-less `<input type=file>` like drawings import at ObjectTree.tsx:54-62).

**Interfaces:**
- `exportLayoutJson(layout: Layout): string` → pretty `{format: "ezyview-layout", version: 1, layout}`.
- `parseLayoutJson(text: string): Layout` — throws `Error("Not an EzyView layout")` on wrong format/version/shape; structural validation per field (id/name/grid/charts array; drop unknown chart fields rather than trust) — same opaque-message convention as `pineShare.parseScriptJson`.

**Steps:**
- [ ] Step 1: Failing tests — round-trip preserves symbol/resolution/indicators/drawings; wrong format/version/garbage throw exact message; malformed charts entries dropped or rejected (pin one behavior).
- [ ] Step 2: Implement + menu entries **"Export layout (JSON)"** / **"Import layout…"** wired to store (import creates a new layout and activates it — match how layouts are created elsewhere in store.ts).
- [ ] Step 3: Gates clean.

### Task 4: Share link + copy link

**Files:**
- Create: `apps/desktop/src/shareLink.ts` + `shareLink.test.ts`
- Modify: `apps/desktop/src/Toolbar.tsx` (entry), boot path (`App.tsx` or `main.tsx`) to consume a link param, `windows.ts` only if it hosts the parser (prefer separate module).

**Interfaces:**
- `buildShareLink(base: string, meta: { symbol: string; resolution: string }): string` — `base` + `?share=<symbol>:<resolution>` (URLSearchParams-encoded; caller passes `location.origin + location.pathname` or hash-route base — pin the exact format in the test).
- `parseShareLink(url: string): { symbol: string; resolution: string } | null` — never throws; hostile: >512-char input → null, symbol `^[A-Z0-9.\-]{1,20}$` after uppercasing else null, resolution outside the known set → null, missing/invalid → null.
- Boot: if `parseShareLink(location.href)` non-null → apply symbol+resolution to the active chart (existing store actions for symbol/resolution change — find the ones the symbol-search box uses) and strip the param from the URL (history.replaceState) so refresh doesn't re-apply.
- Menu entry **"Copy chart link"** → `navigator.clipboard.writeText` guarded (absent → `downloadBlob` of a `.txt` fallback or silent no-op with the existing toast/banner pattern — pick what exists in the file).

**Steps:**
- [ ] Step 1: Failing tests — build→parse round-trip, hostile/oversized/missing cases, resolution whitelist.
- [ ] Step 2: Implement + boot consumption + menu entry.
- [ ] Step 3: Gates clean.

### Task 5: Embed snippet + SVG + PDF print

**Files:**
- Create: `apps/desktop/src/embedSnippet.ts`, `svgExport.ts` + tests
- Modify: `apps/desktop/src/Toolbar.tsx` (3 entries), clipboard guard as needed.

**Interfaces:**
- `embedSnippet(opts: { src: string; width?: number; height?: number; title?: string }): string` — HTML `<iframe src="…" width=… height=… title=… loading="async" style border:0></iframe>`; defaults 800×600, title `"EzyView chart"`. Caller passes `buildShareLink(...)`. Test: exact tag attrs, defaults, escaping (title with `"` → `&quot;`).
- `svgFromPng(dataUrl: string, meta: { title: string; symbol: string; resolution: string }): string` — standalone SVG 1.1 wrapping `<image>` with the data URL href, `viewBox` sized from `#0e1117` canvas dims if derivable else fixed default (state which in a comment), `<title>` element with escaped meta. Canvas is raster — this is the honest SVG form (deviation recorded in §12 later). Tests: well-formed string, escapes `<`, contains format comment header `<!-- ezyview-chart -->`.
- PDF: `printPng(dataUrl: string, meta): void` — opens the existing print path (hidden iframe with `<img>` + `window.print()`), guarded for node/absent `window.print`. Not unit-testable; typecheck+lint only. **No new deps — print-to-PDF raster.**

**Steps:**
- [ ] Step 1: Failing tests for `embedSnippet` + `svgFromPng` (defaults, escaping, malformed data URL rejected → throw or empty, pin one).
- [ ] Step 2: Implement; menu entries **"Copy embed snippet"**, **"Export chart image (SVG)"**, **"Export chart image (PDF, print)"**; copy via guarded clipboard (fallback: `downloadBlob` `.html`/`.svg`).
- [ ] Step 3: Gates clean.

### Task 6: Native save dialog (Tauri) + palette completeness

**Files:**
- Create: `apps/desktop/src-tauri/src/export_file.rs` (or inline in `lib.rs`) — command `save_file(path: String, contents: String) -> Result<(), String>` (utf-8 write; bytes variant only if a binary exporter needs it — PNG goes through dialog+data-URL decode in Rust? Keep PNG on anchor path if bytes are awkward: `save_file_b64(path, dataUrl)` decoding the base64 payload in Rust — decide in implementation, smallest diff wins).
- Modify: `apps/desktop/src-tauri/src/lib.rs` (register command), `capabilities/default.json` if the `core:dialog` permission needs adding beyond `dialog:default` (verify against plugin docs — `dialog:default` already present), `apps/desktop/src/exportUi.ts` (Tauri branch: `window.__TAURI_INTERNALS__` present → `invoke("plugin:dialog|save", { defaultPath, filters })` → cancelled (`null`) aborts → `invoke("save_file", { path, contents })` → failure surfaces via the existing error banner pattern), `CommandPalette.tsx` (all export commands present as palette entries — verify `buildExportEntries` reuse or add explicitly).

**Interfaces:**
- `exportUi.ts` gains `saveBlob(blob: Blob, filename: string, filters?: { name: string; extensions: string[] }[]): Promise<"saved" | "cancelled" | "failed">`; all Task 1-5 exporters call `saveBlob` instead of raw `downloadBlob` (browser keeps anchor behavior inside `saveBlob`).

**Steps: [ ]** TDD only for a pure filter/extension helper if extracted; Rust command has no unit harness (state honestly). Wire, re-point all exporters, palette audit, gates (lint/typecheck/vitest — plus `cargo check` if configured in CI; match what CI runs for src-tauri changes).

### Task 7: Gates + MASTERPLAN close-out

- Full gates: `npm run lint`, `npm run typecheck`, `npx vitest run --configLoader runner`, `npm run build:web`.
- MASTERPLAN: §7 row 8 → **done (PR #18)**; §8 add Phase 8 closed line (PNG/SVG/print-PDF/CSV/JSON export, layout share files, share links, embed snippet, native save dialog; deferred: co-editing, cloud sync, vector PDF); §12 Phase 8 → Done with deviations (SVG = embedded raster; PDF = print-to-PDF raster; embed snippet targets a local share URL since no hosted renderer exists); known-gaps refresh.
- (Controller runs git usual ops separately.)
