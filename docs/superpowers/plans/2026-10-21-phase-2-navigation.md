# Phase 2 — Navigation / Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace App.tsx's boolean panel flags with React Router routes behind a persistent shell (left rail + top toolbar + status bar), and move the MT5 setup tabs onto a `/settings` route.

**Architecture:** Add `react-router` (v7 library mode) behind a `HashRouter` (Tauri asset-protocol safe). `App.tsx` becomes the shell: left nav rail, TabBar, Toolbar, `<Routes>`, footer. The chart workspace moves to `ChartPage`; journal/fundamentals/options/pine/settings become their own pages. Side panels (watchlist/depth/objects/trading) stay page-local booleans inside the shell — only navigation destinations become routes.

**Tech Stack:** React 19, react-router v7, zustand (unchanged), Tailwind, vitest (node environment, no jsdom — logic tests only, matching existing patterns).

**Spec:** `MASTERPLAN.md` §11 (Phase 2 detailed), §17 (navigation spec), §8 (known gaps). Exit criteria: dedicated pages, no global boolean panel flags.

**Execution method (supplied by user):** native — implement in-session, then full git ops (commit → push → PR → CI green → merge without approval) → report.

## Global Constraints

- Exit criteria (§7): "dedicated pages, no boolean panel flags" — `tradingOpen/journalOpen/fundamentalsOpen/optionsOpen/pineOpen` globals in App.tsx must be gone.
- Left rail order (§17): Chart, Journal, Fundamentals, Options, Pine, Settings.
- Phase 1 surfaces (Connection/Broker/Safety/Audit tabs of `Mt5Setup`) move onto `/settings`; no behavior change to keyring/gates/audit (existing `tradingSafety.test.ts`, `trading.gate.test.ts` must stay green).
- Tests run in node environment (`vitest.config.ts`); no new test infra (no jsdom).
- All gates green before git ops: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:web`.
- Lazy imports stay for journal/fundamentals/options (startup bundle stays small).
- Detached chart windows (`readDetached`) bypass the router entirely.

## Deviations from spec (recorded, agreed by scope)

- Multi-window "journal on second monitor" deferred to Phase 9 (native window management is Phase 9 scope; requires new Rust Tauri command that cannot be verified on this box — rustc not installed). Chart pop-out already exists.
- Panel sizes are fixed today (no drag-resize), so there is nothing to persist; last route IS persisted (localStorage, guarded pattern like `mt5.ts`).
- `tradingOpen` remains a boolean but becomes a ChartPage/shell side-panel toggle, not a navigation destination — §17's left rail has no Trading entry.

## Review Focus

1. **Deep-link/unknown route** (`#/bogus`, `#/`) must resolve to stored last route or `/chart` — `nav.test.ts::normalizePath` covers known/unknown/empty/stored-less cases.
2. **Stale stored route** (route later removed) must not loop — `rememberRoute` writes only known routes; test: `rememberRoute("/bogus")` leaves storage unchanged.
3. **Detached chart window** must not mount the router or touch route storage — `main.tsx` branches before `<HashRouter>`; `windows.test.ts` stays green.
4. **Pine editor still loads bars + Monaco after becoming a page** — bars-loading effect moves into `PinePage`; manual verification step: open `/pine`, editor renders, run starter script.
5. **Phase 1 safety rails unaffected by Settings move** — `Mt5Setup` tabs are relocated, not rewritten; `npm test` (all mt5/safety suites) is the gate.

---

### Task 0: Loose item — E2E drawing pass (MASTERPLAN checklist)

**Files:**
- Modify: `MASTERPLAN.md` (tick the Phase 0 E2E checkbox after the pass)

**Interfaces:**
- Consumes: running dev server (`npm run dev --workspace apps/desktop`, vite on 127.0.0.1:1420), browser driver (puppeteer MCP).
- Produces: checked checkbox `- [x]` for "E2E test: place 3-point trend line, verify 3 anchors, undo, redo".

- [x] **Step 1: Start vite dev server** (no Tauri — rustc absent; web build is the harness).
- [x] **Step 2: Drive the app** — pick a 3-click drawing tool (parallel channel: base start, base end, offset), click 3 points on the chart canvas.
- [x] **Step 3: Verify** — screenshot shows the placed shape; footer "N drawings" count increments to 1.
- [x] **Step 4: Undo** — `Ctrl+Z`, footer count returns to 0, shape gone (screenshot).
- [x] **Step 5: Redo** — `Ctrl+Y`, count back to 1, shape back (screenshot).
- [x] **Step 6: Tick the checkbox** in MASTERPLAN.md §14.

### Task 1: `nav.ts` route logic (TDD)

**Files:**
- Create: `apps/desktop/src/nav.ts`
- Test: `apps/desktop/src/nav.test.ts`

**Interfaces:**
- Produces:
  - `ROUTE_PATHS` — `readonly ["/chart", "/journal", "/fundamentals", "/options", "/pine", "/settings"]`
  - `NAV_ITEMS: readonly { to: string; label: string; key: string }[]` — left-rail order per §17 (labels: Chart, Journal, Fundamentals, Options, Pine, Settings; icons stay in NavRail.tsx)
  - `PANEL_ROUTES: { journal: "/journal"; fundamentals: "/fundamentals"; options: "/options"; pine: "/pine" }`
  - `normalizePath(path: string): string` — known path → itself; otherwise stored last route if known, else `"/chart"`
  - `rememberRoute(path: string): void` — writes localStorage key `ezyview:lastRoute` only when path is known; no-op without localStorage
  - `readLastRoute(): string` — stored-and-known → it; else `"/chart"`; guarded `typeof localStorage === "undefined"` (pattern from `mt5.ts:38`)

- [ ] **Step 1: Write failing tests** — cases listed in Review Focus items 1–2 plus: `normalizePath` passthrough for each of the 6 routes; `readLastRoute` default `/chart` with empty storage and with no localStorage global (stub like `mt5Accounts.test.ts:51` `g.localStorage = {...}`).
- [ ] **Step 2: Run** `npm test -- nav.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `nav.ts`** to the signatures above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: Phase 2 route helpers with last-route persistence`.

### Task 2: Router mount, shell, ChartPage extraction

**Files:**
- Modify: `apps/desktop/package.json` (add `react-router`)
- Modify: `apps/desktop/src/main.tsx` — main branch only: `<HashRouter><App/></HashRouter>`; detached branch untouched
- Create: `apps/desktop/src/NavRail.tsx` — `NavLink` rail, icons via lucide-react (`LineChart`, `BookOpen`, `Newspaper`, `Sigma`, `Code`, `Settings`), active styling from `NAV_ITEMS`
- Create: `apps/desktop/src/ChartPage.tsx` — moves from App.tsx: DrawingToolbar, ChartGrid (+ Readout/ToolHint/GRID_CLASS/NO_LINES helpers stay exported or move), ChartCommandInput, side panels (ObjectTree/Watchlist/DepthOfMarket), RightRail, TradingPanel, ReplayBar, linesBySymbol memo, `useTradingTicks` exposure (with `tradingOpen`), pine-bars effect NOT moved (deleted here, Task 4 re-adds in PinePage)
- Modify: `apps/desktop/src/App.tsx` — shell: NavRail + TabBar + Toolbar + `<Routes>` + footer. Side-panel booleans kept: `watchlistOpen, domOpen, objectsOpen, tradingOpen`. Deleted: `pineOpen, journalOpen, fundamentalsOpen, optionsOpen`. Route effect: `useEffect(() => rememberRoute(location.pathname), [location.pathname])`. `resolve` initial: `"/"` and unknown → `<Navigate to={normalizePath(pathname)} replace/>`
- Modify: `apps/desktop/src/Toolbar.tsx` — `PanelId` narrows to `"watchlist" | "depth" | "objects" | "trading"`; journal/fundamentals/options menu entries become `kind:"action"` using `useNavigate()`; pine entry becomes action → `/pine`; `pineActive` derived from `useLocation()`; `props.onTogglePine`/`pineActive` props removed
- Modify: `apps/desktop/src/RightRail.tsx` — ITEMS = 4 side panels only, no separator
- Create placeholder pages (full content in Tasks 3–5): `JournalPage.tsx`, `FundamentalsPage.tsx`, `OptionsPage.tsx`, `PinePage.tsx`, `SettingsPage.tsx` — each returns `<section aria-label="…">` stub
- Route table: exactly `ROUTE_PATHS`; `Route index` → Navigate to normalizePath; `path="*"` → Navigate to `"/"` (chain resolves via normalize)

**Interfaces:**
- Consumes: Task 1 (`ROUTE_PATHS`, `NAV_ITEMS`, `normalizePath`, `rememberRoute`)
- Produces: `ChartPage` props `{ watchlistOpen, domOpen, objectsOpen, tradingOpen, onToggle: (id: PanelId) => void, onOpenAlerts: () => void }` (alert dialog stays shell-owned; ChartPage calls back)

- [ ] **Step 1:** `npm install react-router -w apps/desktop` (network: registry.npmjs.org).
- [ ] **Step 2:** Extract ChartPage + NavRail + shell rewire + Toolbar/RightRail narrowing + placeholder pages.
- [ ] **Step 3: Gates** — `npm run typecheck` (fix stale `journalOpen`/`pineActive` refs), `npm test`, `npm run lint`.
- [ ] **Step 4: Manual smoke** — dev server: all 6 rail links switch pages; chart page still draws/undo/redo; side panels toggle; footer intact.
- [ ] **Step 5: Commit** `feat: Phase 2 router shell with route-driven pages`.

### Task 3: Journal / Fundamentals / Options pages

**Files:**
- Modify: `apps/desktop/src/JournalPanel.tsx` — root `h-56` → `min-h-0 flex-1` (page fill); Close button stays, calls `onClose`
- Modify: `apps/desktop/src/FundamentalsPanel.tsx` — root `h-64` → `min-h-0 flex-1`
- Modify: `apps/desktop/src/OptionsPanel.tsx` — root `h-64` → `min-h-0 flex-1`
- Modify: `JournalPage.tsx` / `FundamentalsPage.tsx` / `OptionsPage.tsx` — render the (still-lazy) panels full page; `onClose={() => navigate("/chart")}`; Fundamentals keeps `symbol`/`onPickSymbol` from active chart (read `useWorkspace` inside the page, not shell)

**Interfaces:**
- Consumes: shell side-panel state; `useWorkspace` store (global — pages read it directly)
- Produces: unchanged panel component APIs (props signatures identical)

- [ ] **Step 1:** Replace placeholder bodies; adjust panel root classNames.
- [ ] **Step 2: Gates** — typecheck, tests.
- [ ] **Step 3: Manual smoke** — journal close button returns to `/chart`; fundamentals symbol pick updates chart state.
- [ ] **Step 4: Commit** `feat: dedicated journal/fundamentals/options pages`.

### Task 4: Pine page

**Files:**
- Modify: `apps/desktop/src/PineEditor.tsx` — drop `open` prop and `Modal` wrapper; root becomes `<section aria-label="Pine editor" className="flex min-h-0 flex-1 flex-col …">`; header Close calls `onClose`
- Create: `apps/desktop/src/PinePage.tsx` — reads active symbol/resolution from `useWorkspace`; owns the bars-loading effect (moved from App.tsx:108-117); renders `<PineEditor onClose={() => navigate("/chart")} bars symbol/>`
- Modify: `App.tsx` — delete `<PineEditor …>` mount and `pineBars` state

**Interfaces:**
- Consumes: `loadHistory` from `./data`, `useWorkspace`
- Produces: `PineEditor` props `{ onClose, bars, symbol }` (note: `open` removed)

- [ ] **Step 1:** Refactor + wire `/pine`.
- [ ] **Step 2: Gates** — typecheck, tests.
- [ ] **Step 3: Manual smoke** — `/pine` loads Monaco, run starter script, save script, close returns to chart.
- [ ] **Step 4: Commit** `feat: Pine editor as /pine page`.

### Task 5: Settings page + Mt5Setup relocation

**Files:**
- Modify: `apps/desktop/src/Mt5Setup.tsx` — export the four tab bodies (`ConnectionTab`, `BrokerTab`, `SafetyTab`, `AuditTab`) or a new exported `Mt5SettingsTabs` component (tab row + active tab state, no popover); delete popover/footer-only `Mt5Setup` button
- Create: `apps/desktop/src/SettingsPage.tsx` — tab row: Connection | Broker | Safety | Audit | Data | Appearance; Data = button opening the existing ApiKeys dialog (`useApiKeys.getState().openDialog()`); Appearance = dark/light radio writing active chart theme (`updateActive({theme})`)
- Modify: `apps/desktop/src/App.tsx` footer — replace `<Mt5Setup />` with a `Link to="/settings"` (gear icon + same status badge: `useMt5` status dot copied from old button)

**Interfaces:**
- Consumes: `useMt5`, `useMt5Accounts`, `useApiKeys` (all global stores — unchanged)
- Produces: SettingsPage with zero new state stores

- [ ] **Step 1:** Relocate tabs; footer link; delete popover.
- [ ] **Step 2: Gates** — typecheck, tests (safety suites must be green), lint.
- [ ] **Step 3: Manual smoke** — footer gear → `/settings`; all 4 MT5 tabs render; bridge URL save works; audit loads; API keys dialog opens from Data tab.
- [ ] **Step 4: Commit** `feat: /settings route hosts MT5 setup tabs`.

### Task 6: MASTERPLAN status + final verification

**Files:**
- Modify: `MASTERPLAN.md` — §7 table: Phase 2 → `**done** (PR #12)` (adjust to actual PR number); §8 snapshot: navigation bullet → closed, note Mt5Setup now on `/settings`; §11 heading → "Delivered (PR #N). Deviations: journal second-monitor window deferred to Phase 9; panel sizes fixed — only last route persisted."; §21 approval gate update; §14 checkbox already ticked from Task 0

- [ ] **Step 1:** Edit MASTERPLAN status sections.
- [ ] **Step 2: Full gates** — `npm run lint && npm run typecheck && npm test && npm run build:web`.
- [ ] **Step 3: Commit** `docs: Phase 2 delivered — status, deviations`.

### Task 7: Git ops (user pre-approved: merge without asking)

- [ ] **Step 1:** Branch `feat/phase-2-navigation` from main; commits from Tasks 1–6 land on it.
- [ ] **Step 2:** Push with sandbox bypassed (sandbox cannot read GitHub login).
- [ ] **Step 3:** Open PR via GitHub MCP (title `feat: Phase 2 navigation / IA`, body per repo template if any, attribution footer).
- [ ] **Step 4:** Watch CI until green; fix failures if any.
- [ ] **Step 5:** Merge PR (user pre-approved), verify merge, pull main.
- [ ] **Step 6:** Report: what shipped, deviations, pending tasks/phases (Phases 3–10 + remaining loose items).
