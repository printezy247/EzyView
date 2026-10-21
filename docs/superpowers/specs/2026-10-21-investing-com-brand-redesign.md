# EzyView UI/UX Redesign — Investing.com Brand, Compact Density, Every Function a Destination

Date: 2026-10-21 · Status: proposed · Input: full codebase audit + external research
(Investing.com brand measurement, 6 open-source trading repos, TradingView label inventory)

Goal: keep every function EzyView has (feature parity with TradingView), add the ones
that fit an Investing.com-branded terminal, and look nothing like TradingView. TradingView's
visual DNA is the blue `#2962ff` accent, teal `#26a69a` candles and airy spacing. We replace
all of it with Investing.com's measured brand system: red accent, green/red market colors,
dark chrome over light content, Inter with tabular numerals, dense uniform tables.

---

## 1. Design principles

1. **Brand is Investing.com, not TradingView.** Red `#d91400` accent, dark chrome `#181c21`,
   white/light content canvas, dense quote tables as the signature surface.
2. **Compact but never cramped.** One density: 24px rows, 28px controls, 4px spacing grid.
   No `text-[9px]`, no `text-[11px]` scatter — one type ramp everywhere.
3. **Uniform or it doesn't ship.** Every button/input/select/chip/table row comes from one
   primitive. Per-file class-string constants are deleted, not migrated.
4. **Every function is a destination.** Each feature is a route or a full modal ("sheet"),
   reachable from nav, command palette (`Ctrl+K`), and context menus — one command registry.
5. **Keyboard first.** `Ctrl+K` palette, `?` hotkey sheet, arrow-key menus — parity with the
   high-end terminals (OpenTerminalUI, TradeCanvas).
6. **Honest data.** Every quote carries provenance: live / delayed / demo / cached.

---

## 2. Brand system (tokens)

Source: Recolor measurement of investing.com (Oct 2026: main `#d91400`, palette
`#d91400 / #0ea600 / #1256a0 / #b19e00 / #f2a93b`, canvas `#ffffff`, dark chrome `#181c21`,
Tailwind-based, dark mode present), logo amber `#F4A41D`, fonts Inter + Roboto.

### 2.1 Themes — three, app-level (see §6.3 for decoupling from per-chart theme)

**invest-dark** (default; dark terminal with red accent):

| Token | Value | Use |
|---|---|---|
| `--ev-bg` | `#12161d` | app canvas behind panels |
| `--ev-panel` | `#181c21` | panels, tables, dialogs (Investing chrome) |
| `--ev-raised` | `#22272f` | hover rows, popups |
| `--ev-chrome` | `#0e1216` | top nav bar / rails (darker than content = signature inversion) |
| `--ev-line` | `#2a2f38` | borders/dividers |
| `--ev-accent` | `#d91400` | primary buttons, active states, brand |
| `--ev-accent-hover` | `#b91100` | pressed/hover |
| `--ev-accent-text` | `#ff4b3e` | red text on dark (AA on panel) |
| `--ev-up` | `#0ea600` | bid/up/positive |
| `--ev-down` | `#d91400` | ask/down/negative (brand red doubles as down — Investing.com does the same) |
| `--ev-link` | `#4a90e2` | links, selections, secondary focus (their `#1256a0` lightened for dark AA) |
| `--ev-warn` | `#f2a93b` | warnings, calendar impact dots (logo gold) |
| text ramp | `#8b909a / #aab0ba / #d8dce2 / #ffffff` | muted / text-2 / text / strong |

**invest-light** (Investing.com's web look; also the "auto" day theme):

| Token | Value |
|---|---|
| `--ev-bg` | `#ffffff` |
| `--ev-panel` | `#f7f8fa` |
| `--ev-raised` | `#eceff2` |
| `--ev-chrome` | `#181c21` (dark top bar on light content — the Investing.com signature) |
| `--ev-line` | `#e2e5ea` |
| `--ev-accent` | `#d91400` · hover `#b91100` · text `#c11200` |
| `--ev-up` | `#0ea600` · `--ev-down` `#d91400` · `--ev-link` `#1256a0` · `--ev-warn` `#b19e00` |
| text ramp | `#6b7078 / #4a4e56 / #1b1f26 / #000000` |

**tokyo** stays as the user extra, but inherits the new accent/red semantics and density.

Chart-engine theme (`packages/chart-engine/src/theme.ts`) is rewritten to derive grid/candle
colors from the same palette values — one source file exported to both CSS and TS
(`packages/chart-engine/src/brand.ts` or a shared JSON), no more copy-pasted hexes.

### 2.2 Typography

- **Ship Inter** (variable, self-hosted woff2 in `apps/desktop/public/fonts/`, SIL OFL) —
  currently declared in `styles.css` but never loaded, so the app renders system-ui today.
  Investing.com's actual primary font. Roboto not needed; Inter covers it.
- One ramp, registered as Tailwind theme sizes (kills `text-[9px]/[10px]/[11px]/[12px]` soup):

| Token | Size / line | Use |
|---|---|---|
| `--text-micro` | 10 / 14 | badges, provenance chips, axis labels |
| `--text-dense` | 11 / 16 | watchlist/DOM/trading tables |
| `--text-base` | 12 / 18 | all controls, menus, toolbar, most UI |
| `--text-body` | 13 / 20 | dialogs, panel body text |
| `--text-title` | 15 / 20 | dialog titles, section heads |
| `--text-head` | 18 / 24 | page titles |

- **Tabular numerals everywhere numbers live**: `.num { font-variant-numeric: tabular-nums; }`
  applied to every price, %, P&L, volume, calendar time — the compact-table trick that makes
  dense views readable. Inter ships this.

### 2.3 Geometry, elevation, z-index

- Radius: 4px everywhere (`rounded` default overridden in theme), 6px for dialogs. No pills
  except status chips.
- Control heights (uniform, enforced by primitives): `sm 24px`, `md 28px` (default),
  `lg 32px`. Table rows: 24px (dense), 28px (comfortable toggle).
- Spacing: strict 4px grid; no arbitrary `px-1.5`/`gap-6` drift in controls.
- Z-index scale (one source, `@theme`): `--z-canvas 0 → --z-panel 10 → --z-sticky 20 →
  --z-nav 30 → --z-dropdown 40 → --z-overlay 50 → --z-dialog 60 → --z-palette 70 →
  --z-toast 80`. Every existing `z-40/z-50/Monaco z-35…100` usage mapped onto it.

---

## 3. Component layer — "high-end" primitives

Audit found: zero UI libraries, all controls hand-rolled, 12+ per-file `const btn/field/chip`
string duplicates, two modal backdrop conventions, inconsistent z-levels, `window.alert`
/ `window.confirm` leftovers.

**Decision: adopt Radix UI primitives under own styled wrappers (the shadcn approach, no CLI).**
Radix gives collision-aware positioning, focus management, keyboard contracts and animation
timings that hand-rolled code re-implements badly. Wrappers keep the `ev-*` token styling, so
nothing looks generic. Menu.tsx/Modal.tsx knowledge (focus trap, Escape order, Monaco opt-out)
carries over into the wrappers.

New `apps/desktop/src/ui/` directory — the only place class constants live:

| Primitive | Replaces | Notes |
|---|---|---|
| `Button` (sm/md/lg × ghost/outline/solid/danger) | 10+ inline `const btn` strings | red primary, charcoal outline |
| `IconButton` | ad-hoc icon buttons | 24/28px, mandatory `aria-label` |
| `Input` / `NumberInput` / `SearchInput` | 6+ `const field` strings | 28px, `12px` text |
| `Select` / `Combobox` | native `<select>`, ad-hoc pickers | Radix Select + popover search (symbol, interval, timezone, template pickers) |
| `DropdownMenu` | `Menu.tsx` internals, `ChartContextMenu` | one positioning/animation/backdrop policy |
| `Popover` | scattered absolute overlays | chart command input, footer feed popovers |
| `Dialog` + `DialogHeader/Body/Footer` | `Modal.tsx` + per-dialog backdrop hacks | **one** backdrop: `fixed inset-0 z-dialog bg-black/50`, blur optional |
| `Sheet` (side drawer) | none today | right-docked full-height panels & mobile-style flows |
| `Command` (cmdk) | `CommandPalette.tsx` | `Ctrl+K` palette; grouped, fuzzy, recent section |
| `Tabs` | hand-rolled tabs (Settings 8 tabs etc.) | roving tabindex, animated underline |
| `Tooltip` | native `title=` only | `12px`, dark bubble, hover+focus trigger |
| `Table` primitives (`Table, THead, TR, TD, TNum`) | 3 divergent `Row` defs (OrderTicket/DOM/ObjectTree) | 24px dense rows, hover/selected states |
| `Chip` / `Badge` | inline spans | provenance, impact, interval chips |
| `ConfirmDialog` | `window.confirm`/`window.alert` (DesktopTab:46, Toolbar:363, exportUi:89) | danger variant |
| `StatusDot` | App.tsx inline status colors | feed status, connection states |

All accept `className` via a `cn()` helper (clsx + tailwind-merge — already installed,
currently unused).

---

## 4. Information architecture — every function a destination

Current: 6-item NavRail + 7-menu toolbar + 4 boolean right-panels + 6 routes. Redesign to
**8 nav sections**, each a category that owns routes and sheets. NavRail becomes icon rail
with hover-flyout labels (Investing.com's hover-nav pattern), active state = red accent bar.

| # | Section | Route(s) | Sheets (full modal / drawer) |
|---|---|---|---|
| 1 | Terminal | `/chart` (grid, drawings, replay, DOM, T&S) | Symbol master search, chart templates, interval builder |
| 2 | Markets | `/markets` (watchlists manager + screener + heatmap) | Add/edit symbol, list manager |
| 3 | Trade | `/trade` (order ticket, positions, working orders, blotter) | Trade confirm, bracket/SL-TP editor |
| 4 | Research | `/research` (fundamentals + options chain + news tabs) | Statement viewer, earnings/dividends/economic **calendars** |
| 5 | Journal | `/journal` (calendar, stats, reviews, prop-firm bar) | Entry dialog (exists), import |
| 6 | Strategies | `/pine` (Pine editor + strategy tester) | Optimization results, **hotkey sheet** (`?`) |
| 7 | Alerts | `/alerts` (alert manager table: condition, state, last fired) | Create/edit alert (AlertDialog upgraded) |
| 8 | Settings | `/settings` (existing 8 tabs) | MT5 setup, API keys, **layout manager**, export center |

Navigation contract:
- **One command registry**: every action registered once with `{ id, label, category, run,
  shortcut }`. Toolbar menus, `Ctrl+K` palette, context menus and nav all render from it.
  (`buildExportEntries` in Toolbar.tsx is the existing seed — generalized.)
- **`Ctrl+K` = command palette** (industry standard; today it is `Ctrl+Shift+K` while `Ctrl+K`
  is the chart input — swap: palette `Ctrl+K`, chart quick-input `/` only).
- **`?` opens the hotkey cheat-sheet** (stolen from TradeCanvas; we have 36 key handlers and
  no discoverability surface).
- Back/Escape always predictable: sheets close before menus, menus before route change
  (already the Escape contract — formalized in Dialog/DropdownMenu).
- RightRail boolean panels → **docked side-panel system with tabs**: one right dock, any
  number of panels stacked as tabs (watchlist/depth/DOM/objects/trading/T&S), resizable,
  remembers open set per layout. Kills the 4-boolean special case in App.tsx.
- Density toggle in Settings → Appearance: compact (default) / comfortable, stored in
  workspace, applied via `data-density` on `<html>`.

## 5. Feature additions (from repo research — "same functions or more")

| Feature | From | Why |
|---|---|---|
| **Time & Sales tape panel** | eTape | DOM without tape is half a ladder; dock tab |
| **Drag SL/TP on chart** (position line drag = order modify, confirm on release) | TradeCanvas | we have line rendering but no direct manipulation |
| **Volume Profile indicator** (visible-range, POC/VAH/VAL) | TradeCanvas, OpenCharts | top missing indicator in every TV-alternative comparison |
| **Custom interval builder** (assemble 2h/8h/3d from base candles, favorite + persist) | OpenAlgo Charts | we ship fixed 1m…1w only |
| **Chart-cell linking** (group cells: symbol / interval / crosshair sync) | TradeCanvas ChartGrid | 9-cell grid without sync groups is a toy |
| **Quote provenance chips** (live/delayed/demo/cached on every quote header) | OpenTerminalUI | honest data; we have FeedStatus dot only |
| **Economic / earnings / dividends calendars** | Investing.com core product | brand-defining "more than TradingView" feature; Research section |
| **Market heatmap + screener page** | Investing.com, TV | Markets section |
| **Currency converter + market clock** | Investing.com tools | small sheets, cheap, brand-true |
| **Hotkey cheat-sheet dialog** (`?`) | TradeCanvas | discoverability |
| **Session breaks / extended hours** | MASTERPLAN deferred; OpenCharts session plugins | known gap |

Deferred-from-MASTERPLAN items stay deferred (cloud sync, co-editing, walk-forward, signed
updater) — not UI work.

## 6. Fixes & upgrades (audit-driven, with files)

### P0 — brand + foundation (blockers for everything else)

1. **Ship Inter** — self-host variable woff2; today `Inter` is declared but never loaded
   (`styles.css:108 body font-family`, no `@font-face`, no font in `public/`).
2. **Retokenize all three themes to §2.1** — `apps/desktop/src/styles.css`; delete
   `--ev-accent #2962ff` (TradingView blue) everywhere.
3. **Single color source for chart + UI** — `packages/chart-engine/src/theme.ts` currently
   duplicates `styles.css` hexes; derive both from one brand module.
4. **Kill hardcoded hex offenders** (each breaks light theme today):
   - `DrawingProperties.tsx:225` `text-[#f23645]` → `text-ev-down`
   - `ObjectTree.tsx:160` `text-[#f23645]` → `text-ev-down`
   - `ChartPage.tsx:226-232` trading line `#2962ff/#ef5350/#26a69a` → tokens
   - `PineEditor.tsx:926-927` Monaco `editor.background #0e1117` → build theme from tokens,
     follow app theme (today Monaco is dark-only inside a themable shell)
   - `PineEditor.tsx:712,720` SVG strokes `#3fb950/#f85149` → tokens
   - `DepthOfMarket.tsx:97` `rgba(239,83,80,.14)` bars → color-mix on tokens
   - `FundamentalsTabs.tsx:313` `fill="#fff"` → currentColor
   - `App.tsx:90` `theme-color` meta hexes → read from token map
   - `DrawingProperties.tsx:8` swatch palette: keep as *user* colors, but replace the two
     brand-red swatches with `#d91400`
5. **Type ramp + `.num`** — replace `text-[9px]` (delete entirely), `text-[10px]`, the 172×
   `text-[11px]`, 35× `text-[12px]` with ramp tokens; audit every table for `.num`.
6. **`ui/` primitives (§3)** — Button/Input/Select/Dialog/Table first; delete the 12+ inline
   class constants; replace `window.alert`/`window.confirm` (`Toolbar.tsx:363`,
   `DesktopTab.tsx:46`, `exportUi.ts:89`).
7. **One dialog policy** — single backdrop class (`fixed z-dialog bg-black/50`), kill the
   z-40/z-50/absolute/fixed split; `CommandPalette` rebuilt on cmdk inside `Dialog`.
8. **Z-index token scale** — map every `z-*` usage incl. Monaco container overrides.

### P1 — flow & navigation

9. **`Ctrl+K` ↔ `Ctrl+Shift+K` swap**; `/` remains chart quick-input (`App.tsx`,
   `CommandPalette.tsx`, `ChartCommandInput.tsx`, docs mention update).
10. **Command registry** — extract from `Toolbar.tsx` `buildExportEntries` pattern; toolbar
    menus + palette + context menus + nav render from it (testable pure data).
11. **8-section NavRail** with hover flyout labels, red active bar, tooltips (§4).
12. **Right dock with tabs** replacing 4 booleans (`App.tsx` state, `RightRail.tsx`,
    `ChartPage.tsx` panel host); add Time & Sales tab.
13. **New routes/sheets**: `/alerts` manager, `/markets` (watchlist manager + heatmap),
    `/trade`, `/research` (merge FundamentalsPage + OptionsPage + calendars), layout manager
    sheet, export center sheet. `FundamentalsPage`/`OptionsPage` become tabs of Research.
14. **Per-cell theme decoupling** — shell chrome follows **app theme** setting
    (Settings → Appearance, `auto/light/dark`), chart cells keep per-chart palettes.
    Fixes: shell recoloring on last-focused cell, `theme-color` guess, impossible
    mixed-theme grids (`App.tsx:88-93`, store `theme` handling).
15. **Density toggle** (`data-density`), compact default.
16. **Tooltips** replace all `title=` attrs; `aria-haspopup` on every dropdown trigger
    (1 today vs ~10 triggers).

### P2 — features & polish (§5)

17. Time & Sales, drag SL/TP, Volume Profile, interval builder, cell linking, provenance
    chips, calendars, heatmap/screener, converter/clock, `?` hotkey sheet, session breaks.

### P3 — quality gates

18. **Component render tests** — vitest env is `node`; add `happy-dom` + Testing Library in a
    separate projects config so package unit tests stay node-fast; first targets: Dialog
    focus trap, DropdownMenu keyboard, Table density, Command registry completeness (every
    registry entry has a label + category + reachable from palette).
19. **Playwright smoke** (architecture doc defers E2E; one spec: launch → palette → open each
    nav section → theme switch → density switch).
20. **Visual regression baseline** after redesign lands (screenshot per route × theme).

## 7. Related-repo research summary

| Repo | Stars / license | Steal |
|---|---|---|
| OpenCharts | 169 / MIT | plugin-layer pattern (session breaks, tooltips), chart settings dialogs |
| TradeCanvas | 23 / MIT | drag SL/TP overlay, volume profile, hotkey `?` sheet, grid linking, named layouts, 18 chart types (we have 10 — hollow/Equivolume/volume-candles easy adds) |
| OpenTerminalUI | 306 / MIT | keyboard-first shell (`Ctrl+G` go-bar), provenance labelling, evidence-cited AI analyst (future MCP direction) |
| OpenAlgo Charts | Apache-2.0 | custom intervals from source candles, grouped favorites menu |
| eTape | 7 / MIT | Time & Sales, 10s candles, DOM-ladder hotkeys |
| OpenTrader | 16 / GPL | nothing (early stage); confirms lightweight-charts v5 is the right base — we already on 5.2.1 |

Licensing: we use lightweight-charts 5.2.1 (Apache-2.0) — keep the TradingView attribution
notice visible in Settings → About (verify present; required by license).

## 8. Risks

- **Red brand vs red down-color collision** — Investing.com does it; we follow, but primary
  buttons use solid red + white text while down candles use the same red without text, so no
  ambiguity in context. Focus rings use blue `--ev-link`, not red.
- **Lightweight-charts theming** — chart themes must be rebuilt per palette; test all 10
  chart types × 3 themes.
- **Radix bundle size** — tree-shaken per primitive; desktop app, cost negligible.
- **Scope** — P0+P1 is the redesign; P2 features ship incrementally after, each its own
  spec → implement → MASTERPLAN close-out cycle (project convention), TDD per phase.

## 9. Phasing (follows project spec→implement→close-out convention)

- **Phase A (P0)**: brand tokens + Inter + primitives + hardcoded-hex kill + dialog/z policy.
  Test-first: token presence, `cn()` merge, Dialog/Menu keyboard contracts, registry data shape.
- **Phase B (P1)**: nav IA, registry, dock, routes/sheets, theme decoupling, density.
- **Phase C (P2)**: feature batch 1 (T&S, drag SL/TP, volume profile, interval builder, `?`
  sheet), batch 2 (calendars, heatmap, converter).
- **Phase D (P3)**: render-test env, Playwright smoke, visual baselines, MASTERPLAN update.
