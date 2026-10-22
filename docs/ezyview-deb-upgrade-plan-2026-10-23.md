# EzyView `.deb` — release review and phased fix / upgrade plan

Date: 2026-10-23
Baseline reviewed: `f55cb4b` (`main`), version 0.3.0, installed package `ezy-view 0.3.0`
Host: Linux Mint 22.3 (glibc 2.39), Node 22.23.4, Rust 1.99
Method: static code review, targeted reproductions, `lintian` / `dpkg-deb` / `objdump` inspection,
GitHub API check, and upstream / comparable-project research.

**No code was changed by this review.** The deliverable is this plan.

---

## 0. Verdict

The 0.3.0 `.deb` installs and the test suite is healthy, but it is **not release-grade yet**.

Two trading paths can block or corrupt a user action, the package has four `lintian` errors and
ships no licence/copyright files, the binary requires glibc 2.39 without declaring it, the MT5
bridge — a headline feature — is not in the package at all, and the in-app update checker asks
GitHub for a release that does not exist.

**Ship gate:** Phase 0 and Phase 1 must be complete before the next `.deb` is called a release.
Phase 2 makes it a supported release rather than a one-off file.

---

## 1. Baseline evidence

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 107 files, 1010 tests, all pass |
| `npm run lint` | 0 errors, 11 warnings |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `cargo test` | not run in this pass (CI runs it) |
| `lintian EzyView_0.3.0_amd64.deb` | **4 errors, 2 warnings** |
| `objdump -T usr/bin/ezyview` | highest symbol `GLIBC_2.39` |
| `dpkg-deb -I` | `Depends: libwebkit2gtk-4.1-0, libgtk-3-0` only |
| `dpkg-deb -c` | no MT5 bridge, no `NOTICE`, no `LICENSE`, no changelog, no man page |
| GitHub Releases | `GET /releases/latest` → **404**, no tags, no releases |
| Installed on this host | yes, `ezy-view 0.3.0` |

Lintian output, verbatim:

```
E: ezy-view: malformed-contact Maintainer printezy247
E: ezy-view: missing-dependency-on-libc needed by usr/bin/ezyview
E: ezy-view: no-changelog usr/share/doc/ezy-view/changelog.gz (native package)
E: ezy-view: no-copyright-file
W: ezy-view: extended-description-line-too-long line 1
W: ezy-view: no-manual-page [usr/bin/ezyview]
```

Reproduction of the paper-trading close failure (Node 22 strip-types):

```
closeAll: [ 'rejected not enough free margin' ] positions: 1
```

That is a $100,000 paper account at 100x leverage, long 100,000 units at $100 — the position uses
all the margin, and the engine then refuses to close it.

### What is already healthy (do not redo)

- 1,010 unit tests, clean typecheck, clean production dependency audit.
- Rust commands validate paths, keep data at `0700`/`0600`, and restrict the keyring to known names.
- Chart engine has placement validity, undo/redo, drawing hit-testing and theme tests.
- The prior audit's alert-persistence, Pine step-guard and bridge-token work has landed.
- `desktop-file-validate` passes on the installed `.desktop` file.

---

## 2. Findings

Severity: **P0** = lose/block money or trade control; **P1** = package is broken or unsupported;
**P2** = wrong or misleading data, reliability; **P3** = polish.

| ID | Sev | Finding | Evidence | Phase |
|---|---|---|---|---|
| F1 | P0 | Paper engine refuses to close a fully-margined position; `close`/`closeAll` silently report success | `packages/paper-trading/src/engine.ts:512`, `:274`, `:308`; `apps/desktop/src/trading.ts:219-234`, `:250-260` | 0 |
| F2 | P0 | MT5 SL/TP amend sends the **symbol** where the bridge expects a **ticket**; every amend fails as "unknown ticket" | `apps/desktop/src/trading.ts:158`; `packages/mt5-adapter/src/transport.ts:180`; `tools/mt5-bridge/bridge.py:790-797` | 0 |
| F3 | P0 | The same bridge path turns an omitted `sl`/`tp` into `0.0`, so amending one bracket level clears the other (e.g. "break even" wipes TP) | `tools/mt5-bridge/bridge.py:804`, `:813`; caller `apps/desktop/src/TradingPanel.tsx:215` | 0 |
| F4 | P1 | The `.deb` does not contain `tools/mt5-bridge` or any launcher; MT5 cannot work from a packaged install | `tauri.conf.json:70-75`; `dpkg-deb -c` | 1 |
| F5 | P1 | No GitHub Release, tag or release workflow exists; the in-app update check has nothing to find | `apps/desktop/src/updateCheck.ts:7`; GitHub API 404; `git tag` empty | 2 |
| F6 | P1 | Debian metadata is non-compliant: malformed Maintainer, no `libc6` dependency, no changelog, no copyright, no man page, over-long description | lintian output above | 1 |
| F7 | P1 | Binary requires glibc 2.39 but the package does not say so; on Mint 21 / Ubuntu 22.04 `dpkg -i` succeeds and the app dies at launch | `objdump`; `depends` from `dpkg-deb -I` | 1 |
| F8 | P1 | No `LICENSE` / `NOTICE` / Debian copyright in the package, although the binary embeds Apache-2.0 Lightweight Charts | `NOTICE`; `dpkg-deb -c` | 1 |
| F9 | P2 | MCP server is shipped but needs Node 22+, which is neither declared nor detected; on a stock Mint 22 `node` may be 18 or absent | `packages/mcp-server/package.json` build target; `docs/SETUP.md:56` | 1/5 |
| F10 | P2 | Price precision loses FX digits: `precisionFor(1.085) = 3`; Depth of Market is hard-coded to 2 decimals; symbol metadata already carries `precision` | `apps/desktop/src/data.ts:64-70`; `apps/desktop/src/ChartPage.tsx:341`; `apps/desktop/src/OrderTicket.tsx:101` | 3 |
| F11 | P2 | Daily loss / cooldown session resets at **UTC midnight**, not the trader's local or broker day; journal uses local `dateKey` | `apps/desktop/src/tradingSafety.ts:71-72` | 3 |
| F12 | P2 | Time & Sales fabricates random trade sizes and calls them executed prints / "each trade tick" | `apps/desktop/src/TimeAndSales.tsx:47-69`, `:75`, `:97` | 3 |
| F13 | P2 | Demo quote timers leak: every symbol ever quoted keeps a 1 Hz timer; `stopTicking` only fires when a watchlist row is removed | `apps/desktop/src/data.ts:283-305`; `packages/data-adapters/src/demo.ts:186-212`; `store.ts:788` | 3 |
| F14 | P2 | A handful of quote pollers are `void quoteOf(...).then(...)` with no rejection handler, so a provider error becomes an unhandled rejection in the crash log | `ChartPage.tsx:672`, `TimeAndSales.tsx:95`, `TradePage.tsx:41`, `OrderTicket.tsx:87` | 3 |
| F15 | P2 | Journal and screenshots live in `localStorage`; a quota overflow silently drops the write, and there is no full backup/restore path | `apps/desktop/src/journal.ts:104-140`; `store.ts:345-360` | 4 |
| F16 | P2 | Ten panels still poll quotes on independent timers (known open item) | `MASTERPLAN.md` §24; interval grep | 4 |
| F17 | P3 | `getPositions()` is documented as returning snapshots but returns live engine objects | `packages/paper-trading/src/engine.ts:181-183` | 3 |
| F18 | P3 | Journal `expectancy` divides by all closed trades while the win rate ignores break-even in the loss term | `packages/journal/src/stats.ts:148-160` | 3 |
| F19 | P3 | Packaging polish: no AppStream metainfo, no 48/64px icons, no man page, no `Keywords`/`GenericName` in the desktop entry | `dpkg-deb -c`; `.desktop` | 1 |
| F20 | P3 | AppImage requires FUSE 2, which modern Ubuntu/Mint does not install by default; no documented fallback | release packaging | 2 |

Things previously reported that are **already fixed** and should not be re-scheduled: alerts/watchlist
persistence, Pine zero-step and 100k-iteration guard, MCP envelope validation, bridge token support,
bridge CORS restriction, and the SQL/opener plugin removal.

---

## 3. Phases

### Phase 0 — Stop-ship trading fixes

Goal: no user action can be blocked or silently discarded by the trading layer.
Effort: ~1 day. Depends on: nothing.

#### F1 — Make reduce-only orders margin-free

`validate()` charges margin for *every* order. Closing a position reduces margin, so it must not
require free margin.

- Add an `isReducing(request)` check: an opposing side against an existing position.
- Charge margin only on the **opening** quantity:
  `openingQty = reducing ? max(0, request.qty - position.qty) : request.qty`.
- Keep the existing rejection for a genuine size increase that exceeds free margin.
- Make `closePosition()` throw `PaperTradingError` when the engine returns a rejected order, and make
  `closeAll()` throw/aggregate whenever any row is rejected. Do not report success for a rejected close.
- In `apps/desktop/src/trading.ts`, surface that error (the current `close()` sets `error: null`
  unconditionally).

Acceptance tests:

- Fully-margined long closes successfully; position count becomes 0.
- Partial close succeeds.
- `closeAll()` closes every position on a fully-margined account.
- A reversal (sell more than the long) succeeds: the long is closed and the remainder opens short.
- A fresh order that exceeds free margin is still rejected.
- The Node reproduction above prints `filled` and 0 positions.

#### F2 — Amend by ticket, not by symbol

- Add `ticket` to the parked `amend` action and pass `position.id` from both callers
  (`ChartPage` drag and `TradingPanel` break-even).
- `sendMt5()` must call `transport.modify(ticket, ...)`.
- Keep the gate input's `symbol` for display/allow-list purposes only.

Acceptance: a mock transport records `modify("<ticket>", ...)`; a bridge test asserts an amend for a
real position ticket returns 200; an unknown ticket still returns 404.

#### F3 — Amending one level must not clear the other

The bridge currently does `float(body.get("sl") or 0.0)`, so an omitted field becomes "no stop".

- In `_modify`, build the request from the keys actually present:
  `if "sl" in body and body["sl"] is not None: request["sl"] = float(body["sl"])`, same for `tp`.
- Reject `NaN`/`Infinity` before `order_send`.
- On the TypeScript side, send only the levels the user changed; preserve `undefined` as "leave".
- Add a test that amends SL only and asserts TP is unchanged.

Acceptance: drag the SL on a chart with both SL and TP set; only the SL moves in MT5.

#### F1–F3 release gate

- [ ] All three fixes covered by new tests.
- [ ] `npm test`, `npm run typecheck`, `cargo test` green.
- [ ] Manual check on a demo MT5 account (or a recorded fake bridge) for place → amend SL → close.

---

### Phase 1 — Debian packaging compliance and compatibility

Goal: the `.deb` passes Debian policy checks, declares what it needs, and can be understood by a
package manager and a support engineer.
Effort: 1–2 days. Depends on: Phase 0 (metadata can land in parallel).

#### F6 — Fix the control file

- Set `bundle.publisher` to `Name <email>` (GitHub noreply is acceptable) or add `authors` to
  `src-tauri/Cargo.toml`. The current value `printezy247` is not a valid Maintainer.
- Set explicit Debian dependencies rather than only the Tauri defaults:
  `libwebkit2gtk-4.1-0`, `libgtk-3-0`, `libc6 (>= 2.39)` (see F7).
- Add `recommends: ["nodejs", "gnome-keyring"]`; do **not** auto-install Wine.
- Add `deb.changelog` pointing at a Debian-format changelog.
- Add `deb.files` entries for:
  - `/usr/share/doc/ezy-view/copyright` (DEP-5, includes MIT for EzyView and Apache-2.0 for
    Lightweight Charts / other bundled components),
  - `/usr/share/doc/ezy-view/NOTICE` and `LICENSE`,
  - `/usr/share/man/man1/ezyview.1.gz` (a short man page: name, synopsis, files, bugs, homepage),
  - `/usr/share/metainfo/com.printezy247.ezyview.metainfo.xml` (AppStream),
  - optional `48x48`/`64x64` icons.
- Wrap `longDescription` so no line exceeds the Debian limit.
- Add `GenericName=Charting and trading terminal`, `Keywords=trading;charts;stocks;forex;crypto;`,
  and consider `Categories=Finance;Office;`.

Acceptance: `lintian --fail-on error` exits 0; `dpkg-deb -I` shows the full dependency set; all
documented paths exist in `dpkg-deb -c`.

#### F7 — Make the glibc floor explicit

The binary links `GLIBC_2.39` (Ubuntu 24.04 / Mint 22). Two acceptable choices:

- **Keep the 24.04 build** and declare `libc6 (>= 2.39)`, then document "Mint 22+ / Ubuntu 24.04+".
  This matches the host this package is being built for.
- **Support Mint 21 / Ubuntu 22.04** by adding an `ubuntu-22.04` build job (WebKitGTK 4.1 is
  available there) and declaring the lower floor that build actually needs.

Either way, CI should assert the highest `GLIBC_*` symbol against the declared minimum, so a runner
upgrade cannot silently raise the floor.

Acceptance: `apt install ./ezyview.deb` on a clean image of the advertised baseline launches the
app; on an older image, apt refuses with a clear dependency error instead of the app dying at exec.

#### F8 — Ship the licence and notice

- Copy `LICENSE`, `NOTICE` and the Debian copyright file into the package (see F6).
- Add a short "Third-party notices" section to the man page or `/usr/share/doc/ezy-view/`.
- Keep the in-app Settings → Diagnostics notice; the package copy is the redistributable one.

#### F19 — Packaging polish

- AppStream metainfo with summary, description, screenshots (optional), launchable, provides.
- `desktop-file-validate` and `appstreamcli validate` in CI.
- Decide the Wayland app-id question explicitly: either enable `app.enableGTKAppId` and rename the
  desktop file to `com.printezy247.ezyview.desktop`, or leave it off and document that Wayland
  compositors may group the icon by class instead. Verify on Cinnamon/X11 and a Wayland session.

Acceptance: `appstreamcli validate` and `desktop-file-validate` pass; dock icon and name are correct
on Mint 22 Cinnamon and on a Wayland session.

#### F9 — Declare or detect the MCP runtime

- Add `Recommends: nodejs` (see F6) and detect the runtime in Settings → Diagnostics:
  show "MCP server available (Node x.y)" or the exact install command.
- Either raise the bundled MCP target to the lowest Node the deb will find, or document Node 22+
  prominently in the package description/man page and in the Settings card.
- Provide a `/usr/bin/ezyview-mcp` wrapper that resolves the bundled file, so users do not have to
  type `/usr/lib/EzyView/mcp/ezyview-mcp.mjs`.

Acceptance: on a machine without Node, the app explains the dependency instead of failing silently;
with Node 22, `claude mcp add ezyview -- ezyview-mcp` works from a clean shell.

---

### Phase 2 — Release channel, signed updates, CI gates

Goal: the `.deb` becomes an actual supported release with a discoverable update path.
Effort: 2–4 days. Depends on: Phase 1.

#### F5 — Create the first release

- Tag `v0.3.1` (or the next version) and publish a GitHub Release containing:
  `EzyView_<version>_amd64.deb`, `EzyView_<version>_amd64.AppImage`, `SHA256SUMS`, and release notes.
- Add a release workflow triggered by `v*` tags (`tauri-apps/tauri-action` or an explicit build job):
  Ubuntu runner, WebKitGTK deps, `npm ci`, `npm run test`/`typecheck`/`lint`/`lintian`, then upload.
- Keep the release as a draft until the install smoke test passes; then publish so
  `releases/latest` resolves for `updateCheck.ts`.

Acceptance: `GET /releases/latest` returns the tag; the in-app "Check for updates" reports it.

#### Signed in-app updates

- Add `tauri-plugin-updater`, generate a minisign keypair, store the private key and password as
  GitHub Actions secrets, put the public key in `tauri.conf.json`.
- Set `bundle.createUpdaterArtifacts: true` and an endpoint such as
  `https://github.com/printezy247/EzyView/releases/latest/download/latest.json`.
- Inspect the generated `latest.json`: current Tauri updaters select bundle-specific keys
  (`linux-x86_64-deb`, `linux-x86_64-appimage`), and the `.deb` path runs `dpkg -i` via `pkexec` or
  a graphical/terminal sudo fallback. Do not assume the older generic key works for both.
- Keep the current notify-only behaviour until the keypair exists and the first signed release is
  verified. Then make installation user-initiated: show the version and notes, never restart during
  an open position.

Acceptance: a signed AppImage updates itself; a signed `.deb` updates through the authorization
prompt or shows an actionable manual-download path. Back up the signing private key — losing it
prevents updating existing installs.

#### F20 — AppImage expectations

- Document that the AppImage needs FUSE 2 (`libfuse2t64` on Ubuntu 24.04 / Mint 22) and give the
  `--appimage-extract-and-run` fallback.
- Add a line to the release notes: prefer the `.deb` on Mint/Ubuntu; AppImage is the portable build.

#### CI release gates

- `lintian --fail-on error` on the built `.deb`.
- `desktop-file-validate` + `appstreamcli validate` (once metainfo exists).
- Version consistency check across `package.json`, `apps/desktop/package.json`,
  `apps/desktop/src-tauri/tauri.conf.json` and `Cargo.toml` (currently four copies of `0.3.0`).
- A packaging smoke job: install the `.deb` in a clean container of the advertised baseline,
  launch with `xvfb-run`, wait for the window/process, and check the local data folder is created.
  A build that produces a file is not proof that the package runs.

Acceptance: every release tag runs all gates; a red gate blocks publication.

---

### Phase 3 — Market-data accuracy and runtime correctness

Goal: the numbers a trader reads are the numbers the market produced, and the app does not leak
timers or log avoidable errors.
Effort: 2–3 days. Depends on: Phase 0.

#### F10 — One source of truth for price precision

- Add a small precision service: look up `SymbolInfo.precision` (MT5 `digits`, watchlist precision,
  live-source precision) and cache it per symbol.
- Use it in the chart legend, `OrderTicket`, `TradingPanel`, `QuoteHeader`, and the Depth of Market.
- Remove the hard-coded `precision={2}` in `ChartPage.tsx:341`.
- Keep `precisionFor(price)` only as a fallback when the symbol is unknown.
- Test EURUSD (4/5), USDJPY (3), BTCUSDT (2), XAUUSD (2).

Acceptance: EURUSD shows `1.0850`, not `1.085` or `1.09`, everywhere; the DOM tick size matches the
instrument.

#### F11 — One trading day

- Decide the business day: broker server time where available, otherwise the user's local day.
- Use the same helper for the daily-loss tracker, cooldown and journal `dateKey`; do not mix UTC and
  local.
- Expose the chosen timezone in Settings → MT5 safety so the reset is not a surprise.
- Test the boundary: a trade at 23:30 local must belong to that local day.

#### F12 — Time & Sales must not invent prints

The component currently generates a random size for every quote poll and labels it an executed
print. Two acceptable fixes:

- **Preferred:** fetch real trades (Binance `/api/v3/aggTrades`, MT5 broker ticks) and show actual
  price/size/side; degrade to price-only rows when the source has no trade feed.
- **Minimum:** label the panel "Indicative prints from the quote feed — sizes are simulated" and do
  not use the words "executed" or "each trade tick".

Acceptance: a reviewer can tell from the UI whether a row is a real trade or a quote tick; no random
size is presented as market data.

#### F13 — Demo ticker lifecycle

- Reference-count demo subscriptions, or stop a symbol's ticker when no chart/watchlist/tape/ticket
  references it.
- Add a cap and a test that opening 20 symbols and switching away leaves no ticking timers.

#### F14 — Catch quote failures

- Wrap every `quoteOf` call in `.catch(() => null)` (or a shared `safeQuote` helper) so a provider
  outage is a stale price, not an unhandled rejection in the crash log.
- Add one test that a rejected provider promise does not produce an unhandled rejection.

#### F17/F18 — Small correctness fixes

- `getPositions()` should return copies (or the doc should stop claiming it does).
- Compute journal `expectancy` from win/loss trades only, or document that break-even trades are in
  the denominator; add a fixture with a break-even trade to pin the behaviour.

---

### Phase 4 — Persistence, reliability and performance

Goal: the app can hold a real journal and a long trading session without silent data loss or UI
stalls.
Effort: 1–2 weeks. Depends on: Phase 3.

#### F15 — Move the journal off `localStorage`

`localStorage` is a ~5–10 MB string store. Base64 screenshots can exhaust it; the current catch
silently drops the write, and the user is not told.

- Move journal entries/notes/reviews and screenshots to IndexedDB (browser build) or SQLite via a
  Tauri plugin (desktop build), behind the existing journal store API.
- Compress/resize screenshots before saving; enforce a per-entry and total cap with a visible warning.
- Keep `localStorage` for workspace/layout/preferences only.
- Add full export/import (ZIP or JSON + files) and a restore test.
- On first run after migration, import the existing `ezyview.journal.v1` blob and keep a backup.

Acceptance: 500 entries with screenshots survive a reload; filling the quota produces a visible
error and no silent loss; export → factory reset → import restores the journal.

#### Workspace backup and corruption UX

- Add "Export workspace" / "Import workspace" covering layouts, drawings, alerts, watchlist, Pine
  scripts and templates (the pieces already have individual JSON formats).
- Surface the existing `.corrupt` backup in Settings → Diagnostics with a download button, instead
  of leaving it in `localStorage` only.

#### F16 — One quote poller per symbol

- Replace the per-panel intervals (chart legend, ticket, DOM, tape, watchlist, screener, heatmap,
  clock, alert feed) with one shared poller that publishes the latest quote to subscribers.
- Keep the per-source cadence (MT5 500 ms, Twelve Data 8 s, demo/live 1 s) in one place.
- Pause when the window is hidden; resume on focus.
- Acceptance: a 9-cell grid produces at most one request per symbol per tick, not nine; CPU and
  network graphs drop visibly.

#### Performance (known open items)

- Replace `highest`/`lowest` and similar O(n × period) helpers with a monotonic deque; benchmark on
  100k bars before/after and record the numbers.
- Diff marker layers instead of rebuilding them every tick.
- Evaluate Lightweight Charts v5 conflation (`conflationThresholdFactor`, etc.) on a 1M-bar series;
  enable only if it improves measured frame time without changing visible precision.
- Virtualize the journal table, tape and long alert lists.

Acceptance: measured frame time and quote CPU before/after are recorded in the PR; no claim of a
speedup without the measurement.

---

### Phase 5 — Security and Linux desktop integration

Goal: the packaged app is safe to install on a trading machine and behaves like a native Mint app.
Effort: ~1 week. Depends on: Phase 2.

#### F4 — Package or explicitly gate MT5

The `.deb` currently advertises MT5 but ships no bridge.

- Ship `bridge.py`, its README and a launcher under `/usr/lib/EzyView/mt5-bridge/` plus
  `/usr/bin/ezyview-mt5-bridge`.
- The launcher should explain the real prerequisite (Windows Python + `MetaTrader5` inside the Wine
  prefix), not pretend Wine alone is enough.
- Generate a per-install bridge token on first run, store it `0600`, and pass it to both sides;
  make the bridge refuse writes without it even on loopback (the current default is no token).
- Add a Settings → MT5 card that detects the bridge, shows its health and the exact start command.
- Keep Wine/MT5 itself outside the package; `Recommends:` should not drag in a multi-hundred-MB
  Wine install. Document the `~/.mt5` setup path.

Acceptance: a clean install can reach `ezyview-mt5-bridge --check`, get a token, and connect; without
the bridge the UI says what is missing instead of showing a generic connection error.

#### MCP read-only posture

- Keep private-data tools fail-closed (already done) and make the trading surface absent from MCP
  rather than merely unmentioned.
- Add a Settings card that shows the snapshot path, its age, and whether Node is available (F9).
- Do not let an MCP client place orders; if that is ever added, require an explicit per-session
  capability and the same gate/ticket flow as the UI.

#### Pine execution boundary (known open)

`new Function` in the host realm forces `script-src 'unsafe-eval'`. The loop guard exists, but a
script still runs synchronously on the UI thread and can freeze the app for a long time.

- Move `runPine`/`optimizePine` to a dedicated Web Worker with a time budget and cancellation.
- Once no host eval is needed, remove `'unsafe-eval'` from the production CSP and re-test Pine,
  Monaco and the optimizer.
- This is a sizeable change; schedule it separately from the deb release if needed, but keep it on
  the roadmap rather than calling the CSP "done".

#### Linux desktop behaviour

- Tray icon with Show/Hide and connection status (Tauri tray; Linux mouse events are limited, so keep
  actions in the main UI too).
- Window-state plugin for the main window (chart windows already restore themselves).
- Notification privacy: no account numbers, balances or position sizes on the lock screen.
- Document the Wayland limitations: global shortcut (X11-oriented), WebKitGTK DMABUF workaround
  (`WEBKIT_DISABLE_DMABUF_RENDERER=1`) and the existing hardware-acceleration toggle.
- Check keyring availability at startup and show an actionable message if Secret Service is missing;
  recommend `gnome-keyring` in the package.

Acceptance: fresh install on Mint 22 with and without a keyring; tray works; Wayland/X11 icon and
window behaviour checked on both sessions.

---

### Phase 6 — Product upgrades from comparable projects

Goal: after the package is trustworthy, close the most valuable feature gaps.
Effort: 2–4 weeks, independently shippable. Depends on: Phases 2–4.

#### Charting (Lightweight Charts 5.2.1 is already installed)

- **Hit-testing for drawings and order lines.** v5 exposes `hoveredInfo` (`HoveredInfo`) on the
  crosshair payload. Use it to make drawings, SL/TP lines and markers selectable without a second
  geometric hit test, and to improve the right-click menu.
- **Accessibility.** Evaluate the documented accessibility plugin/tutorial for keyboard navigation,
  ARIA and screen-reader announcements; the chart is currently mouse-first.
- **Conflation.** Benchmark `conflationThresholdFactor` and related options on 1M bars before
  enabling; it is off by default and changes what is drawn when zoomed out.
- **Panes.** The engine already uses `addPane()` for oscillators; review pane heights/resizing and
  move remaining overlays where a separate pane is clearer.
- Do **not** replace Lightweight Charts with a GPU engine unless a measured workload fails; the
  research found no evidence that a rewrite is warranted now.

#### Journal (Journedge / Deltalytix / TradeNote patterns)

- **Pre-trade plans**: thesis, setup, entry zone, stop, target, status (planned/executed/missed/
  cancelled), linked to the resulting trade; compare plan vs execution.
- **Strategy playbook**: setups linked to trades, per-setup performance (some of this already exists
  in stats).
- **Import pipeline**: preview, column mapping, timezone selection, fee/commission normalization,
  partial fills, idempotent re-import. This is the highest-value journal work; the current MT5
  `importDeals` path is thin.
- **Bulk edit** and account-aware filters.
- Treat Deltalytix as a product reference only: its repository is CC BY-NC 4.0; do not copy source.

#### Adapters

- Formalize the `MarketDataAdapter` / `TradingAdapter` contract with a conformance suite (timestamps,
  paging, subscriptions, fill/rejection events, disconnect/reconnect). OpenCharts' adapter boundary
  is a useful reference.
- Add a read-only MCP market-data surface separate from trading; do not mix capabilities.

#### Desktop

- Window-state persistence, tray, notification privacy (Phase 5).
- A real settings migration path once journal storage moves (Phase 4).
- Optional: signed APT repository if the user base asks for `apt upgrade` distribution; not needed
  for a GitHub-Releases `.deb`.

#### Research sources

- Lightweight Charts v5 docs / release notes / plugins:
  <https://tradingview.github.io/lightweight-charts/docs/panes>,
  <https://tradingview.github.io/lightweight-charts/docs/plugins/intro>,
  <https://tradingview.github.io/lightweight-charts/docs/release-notes>
- OpenCharts: <https://github.com/dylanpersonguy/OpenCharts>
- Journedge: <https://github.com/TheQuantum-Dev/journedge>
- Deltalytix (patterns only; CC BY-NC): <https://github.com/hugodemenez/deltalytix>
- TradeNote: <https://github.com/Eleven-Trading/TradeNote>
- Read-only MT5 MCP example: <https://github.com/Cloudmeru/MetaTrader-5-MCP-Server>
- Tauri updater: <https://v2.tauri.app/plugin/updater/>
- Tauri Debian guide: <https://v2.tauri.app/distribute/debian/>
- Tauri Linux graphics troubleshooting: <https://v2.tauri.app/develop/debug/linux-graphics/>
- Tauri GitHub release workflow: <https://v2.tauri.app/distribute/pipelines/github/>

Note: the `hectorvss/tradingview-clone` URL in `docs/research-repos.md` returns 404 and should be
removed or replaced; CandleViewer is pre-alpha and is not an architecture blueprint.

---

## 4. Sequencing and release gates

| Order | Phase | Why now | Ship gate |
|---|---|---|---|
| 1 | Phase 0 | Trading bugs block/erase user actions | tests + demo-account manual check |
| 2 | Phase 1 | Package must be installable, legal and honest about requirements | lintian clean, licence files, glibc declared |
| 3 | Phase 2 | Users need a place to download and a way to update | release artifact + signed updater + CI gates |
| 4 | Phase 3 | Wrong prices and fake tape data erode trust | precision/tape/timezone tests |
| 5 | Phase 4 | Journal loss and UI stalls are the next support burden | migration + backup test, measured perf |
| 6 | Phase 5 | MT5 and keyring are the remaining integration risks | clean-install MT5/keyring/Wayland checks |
| 7 | Phase 6 | New features only after the base is trustworthy | each item independently shippable |

Phases 3 and 4 can run in parallel with Phase 2 once Phase 0/1 are on `main`. Phase 6 is not a
release blocker for 0.3.1.

Suggested first release after this plan: **0.3.1** with Phase 0 + Phase 1 only, published as the
first real GitHub Release; then 0.4.0 with Phases 2–3.

---

## 5. Deliberately deferred

- Replacing Lightweight Charts with a GPU/WebGL engine.
- Real-time co-editing / CRDT collaboration.
- Pine v6 and a public script marketplace.
- A signed APT repository (revisit only if `apt upgrade` distribution is required).
- arm64 builds (needs an arm64 runner and a tested WebKitGTK baseline; build once the x86_64 release
  is stable).
- Rewriting the MT5 bridge in another language; the stdlib Python bridge is adequate once packaged
  and token-protected.

---

## 6. Reproduction appendix

```bash
# Build state and baseline
npm run typecheck
npm test
npm run lint
npm audit --omit=dev

# Debian metadata
lintian --no-tag-display-limit apps/desktop/src-tauri/target/release/bundle/deb/EzyView_0.3.0_amd64.deb
dpkg-deb -I apps/desktop/src-tauri/target/release/bundle/deb/EzyView_0.3.0_amd64.deb
dpkg-deb -c apps/desktop/src-tauri/target/release/bundle/deb/EzyView_0.3.0_amd64.deb

# Compatibility floor
rm -rf /tmp/evdeb && mkdir -p /tmp/evdeb
dpkg-deb -x apps/desktop/src-tauri/target/release/bundle/deb/EzyView_0.3.0_amd64.deb /tmp/evdeb
objdump -T /tmp/evdeb/usr/bin/ezyview | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail

# Release channel
curl -s -o /dev/null -w '%{http_code}\n' https://api.github.com/repos/printezy247/EzyView/releases/latest
git tag -l

# Paper close repro (Node 22+): save the snippet below as /tmp/paper-close.mjs, then
node --experimental-strip-types /tmp/paper-close.mjs
```

The paper-close reproduction used in this review:

```js
import { PaperTradingEngine } from "/absolute/path/to/EzyView/packages/paper-trading/src/engine.ts";
const e = new PaperTradingEngine({ startingBalance: 100000, maxLeverage: 100 });
e.updateQuote("X", 100);
await e.placeOrder({ symbol: "X", side: "buy", type: "market", qty: 100000 });
console.log(await e.getAccount());       // margin 100000, freeMargin 0
console.log((await e.closeAll()).map((o) => [o.status, o.reason])); // [['rejected','not enough free margin']]
```

---

## 7. Verification limits of this review

- The desktop UI was not driven interactively; findings are static plus targeted pure-function
  reproductions.
- The MT5 bridge was not run against a live terminal; F2/F3 are proven from the transport call and
  the bridge's ticket lookup, not from a broker round-trip.
- Packaging was inspected on Mint 22.3 only; the Mint 21 / Ubuntu 22.04 failure is inferred from the
  `GLIBC_2.39` symbol and the missing `libc6` dependency, not executed on that image.
- Visual baselines and Cinnamon/Wayland icon behaviour were not re-run.
