# UI/UX pass: premium navigation, styling, and reliability

Date: 2026-11-08
Branch: `feat/ui-navigation-premium`

## What we found

The shell already has good bones: a design-token theme, an icon-only nav rail
with hover flyouts, a Ctrl+K palette, a shared UI kit, virtualised long lists,
and reduced-motion support. The gaps are narrower and more specific:

1. **Navigation is one-dimensional.** The rail is icon-only. A user who does
   not know that "BarChart3" means Research has to hover or open the palette.
   There is no expanded rail, no breadcrumbs, and no way to see where you are
   in a grid layout.
2. **Several pages have no deep links.** Research and Settings read `?tab=`;
   Markets, Trade and Journal keep their tab in React state, so a reload
   loses the view and a link cannot be shared. The palette offers "Go to
   Markets" but not "Go to Markets → Screener".
3. **The shell re-renders on every store change.** `App.tsx` subscribes to the
   whole `activeLayout()`. Drawing a trend line replaces the layout object, so
   the shell — nav rail, tab bar, toolbar, footer — re-renders on every drag
   frame. Same for `ChartPage`, `Watchlist`, `ChartSettingsDialog` and others
   that subscribe to `activeChart()` as a whole object.
4. **The rail's active marker is decorative.** The lit bar is a `div` with
   `aria-hidden`, so screen-reader users get `aria-current="page"` from the
   link but sighted users get a colour cue that no test pins.
5. **Keyboard navigation between sections is missing.** There is no
   `Alt+1..8`, no `Ctrl+Tab` cycle, and no `[` / `]` cycle. The rail is a set
   of links with no roving focus.

## Goals

- Make every destination reachable in at most two clicks, visibly and by
  keyboard.
- Give every page a shareable, reload-safe URL.
- Cut shell re-renders during chart interaction.
- Keep the visual language the app already has, refined: more depth, clearer
  hierarchy, no new colour system.

## Non-goals

- No new product features. No new pages. No new data sources.
- No change to the chart engine, the Pine runtime or the trading logic.
- No light/dark palette rework; the tokens stay as they are.
- No new dependency. The kit is extended in place.

## Part 1 — Navigation

### 1a. Expandable rail

The rail becomes two states, toggled by a button at the top and by
`Ctrl+\`:

- **Collapsed** (today's behaviour): 48px icon column, hover flyouts.
- **Expanded**: 208px, icon plus label plus a live count badge where one
  exists (alerts count, positions count). Active item gets a filled accent
  background rather than only a left bar.

The expanded state persists in `localStorage` so a user who opens it once
gets it every session. The toggle is a real `<button>` with `aria-expanded`
and `aria-controls`.

Why: the rail is the primary orientation device. An icon-only rail forces
recall; a labelled rail forces reading. Both states, same destinations.

### 1b. Breadcrumbs

A breadcrumb strip under the tab bar, above the toolbar:

```
Terminal / BINANCE:BTCUSDT · 1D
```

On the chart page it shows the focused cell's symbol and interval. On a
sub-tab page it shows the section and the sub-tab
(`Markets / Screener`). Each crumb is a link where one exists.

Why: the app has three levels of depth (section → sub-view → detail) and
currently shows none of them.

### 1c. Keyboard section cycling

- `Alt+1` … `Alt+8` jump to the eight sections.
- `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle forward and back through the sections.
- `g` then `c` / `m` / `t` / `r` / `j` / `s` / `a` / `g` — the "go to"
  chord every terminal has. `g` opens a small overlay; the second key
  jumps.

Why: keyboard users currently have exactly one global navigation key
(Ctrl+K). A terminal that hides its own structure behind a palette is a
terminal that is harder to learn.

### 1d. Deep-linkable sub-tabs

Markets, Trade and Journal move their tab state into the URL, matching
Research and Settings:

| Page | URL |
|---|---|
| Markets | `/markets?tab=screener` |
| Trade | `/trade?tab=blotter` |
| Journal | `/journal?tab=stats` |

The tab is written to the URL on change and read back on mount, so a reload
keeps the view and the link can be shared. Unknown or absent `?tab=` falls
back to the default tab, and the existing legacy aliases keep working.

Why: the palette currently generates "Go to Markets", which lands on
Watchlists. With the tab in the URL, the palette can also generate
"Go to Markets → Screener" for every sub-view, so the second level of
navigation is searchable too.

## Part 2 — Premium styling

The visual changes are all refinements of the existing tokens. No new colour
system, no new font.

- **Depth.** Panels get a one-pixel top highlight and a soft outer shadow, so
  the chrome reads as layered surfaces rather than flat rectangles.
- **Hierarchy.** The tab bar, toolbar and footer get a subtle vertical
  gradient, and the active section in the rail is a filled surface with a
  left accent bar, not just a coloured line.
- **Micro-interaction.** Route changes fade in over 120ms. The rail's active
  indicator slides. Both are inside the existing reduced-motion guard.
- **Empty states.** Pages that can be empty (alerts, watchlists, journal
  feed) get one shared empty-state component: an icon, a sentence, and the
  one action that fixes it. Right now they show a bare string.
- **Focus.** Every new interactive element gets the same visible focus ring
  the rest of the app uses.

## Part 3 — Reliability and performance

These are the changes that make the app feel faster without changing what it
does.

### 3a. Narrow the shell's store subscriptions

`App.tsx` currently subscribes to `s.activeLayout()` — the whole layout
object. A drawing drag replaces it, so the entire shell re-renders on every
pointer move. Replace it with narrow subscriptions for the four fields the
shell actually reads: `symbol`, `resolution`, `theme`, `drawings.length`.

The same applies to:

| File | Subscribes to | Replaced with |
|---|---|---|
| `App.tsx` | `activeLayout()` | symbol, resolution, theme, drawing count |
| `ChartPage.tsx` | `activeLayout()` | the fields the page reads |
| `Watchlist.tsx` | `activeLayout()` twice | symbol, data source |
| `ChartSettingsDialog.tsx` | `activeChart()` | the settings fields |
| `SettingsPage.tsx` | `activeLayout()` | symbol, resolution, theme |
| `MarketsPage.tsx` | `activeLayout()` | symbol only |
| `StrategiesPage.tsx` | `activeLayout()` | symbol, resolution, theme |
| `TradePage.tsx` | `activeLayout()` | symbol only |
| `AlertsPage.tsx` | `activeLayout()` | symbol only |
| `TimeAndSales.tsx` | `activeLayout()` | symbol only |
| `CurrencyConverter.tsx` | `activeLayout().charts[0].symbol` | the symbol |

Where a component needs several fields, one `useShallow` selector reads them
together, so the component re-renders only when one of *those* fields changes
rather than whenever any part of the layout does.

### 3b. Route-level error isolation

Only the chart route has an error boundary. If the Journal's stats view
throws, the whole app is replaced by the crash screen. Wrap every lazy route
in the same boundary, so a broken page degrades to a retry button instead of
taking the terminal down.

### 3c. Route change transitions

Cross-fade between routes. Small change, but it stops the page from feeling
like it blinks.

### 3d. Deferred rendering of the footer clock

The market clock ticks on a timer inside the footer, which re-renders the
footer — and with it the whole footer subtree — every second. Move it into
its own isolated component so only the clock re-renders.

### 3e. The palette must not rebuild on every keystroke

`Toolbar` rebuilds its menu groups on every render, and `CommandPalette`
receives `groups` as a prop. The palette's `useMemo` therefore misses on
every parent render. Memoize the group builder so a keystroke in the palette
does not rebuild every menu entry.

## Part 4 — Tests

New unit tests, written before the code they cover:

- `nav.test.ts` — the new `?tab=` deep-link helpers, and the section-cycling
  maths.
- `NavRail.test.tsx` — the expanded state, the toggle's `aria-expanded`,
  persistence, and the keyboard chord.
- `Breadcrumbs.test.tsx` — the crumb list for the chart page and a sub-tab
  page.
- `ui/EmptyState.test.tsx` — the shared empty state renders its action.
- `shell` store-selector tests — the narrow selectors return the same values
  the wide ones did.

Existing tests keep passing: the route table, the eight-section rail, the
palette, the shortcut sheet.

## Part 5 — Release

Version goes `0.4.0` → `0.5.0` (a feature release, not a patch). The version
must be changed in all four places `scripts/check-versions.mjs` checks, plus
the MCP server.

The `.deb` is built and smoke-tested with the existing
`scripts/check-deb.sh` and `scripts/smoke-deb.sh`.

## Order of work

1. Tests for the URL-tab helpers and the section-cycling maths.
2. `?tab=` deep links for Markets, Trade, Journal.
3. Breadcrumbs.
4. Expandable rail + persistence + keyboard chords.
5. Palette: sub-view commands, memoised groups.
6. Narrow store subscriptions (one file at a time, typecheck after each).
7. Route-level error boundaries + route transitions.
8. Empty states, depth styling, focus rings.
9. Version bump.
10. Full verification: lint, typecheck, test, e2e, web build, deb build.

## Risks

- **Visual baselines.** The shell changes shape, so the committed Playwright
  screenshots no longer match. They are local-only by design (CI's font
  rasteriser differs), so they are regenerated locally and committed.
- **Rail state and the e2e smoke test.** The rail is a `navigation` landmark
  named "Sections"; the expanded state must keep that name and the same
  links, or the smoke test breaks.
- **Narrowing subscriptions.** If a component needs a field this plan missed,
  it will read `undefined` at runtime rather than fail to compile. Every
  narrowed file is checked by rendering it in a test, not only by
  typechecking.
