# EzyView — Development setup

EzyView is **desktop-first**: a Tauri v2 app with a React/Vite renderer. The same renderer also
builds to static assets, which is how the optional self-hosted web build works.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 22.19 | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| npm | ≥ 10 | ships with Node |
| Rust | stable ≥ 1.77 | `curl https://sh.rustup.rs -sSf \| sh` |
| Tauri CLI | v2 | installed locally via `npm install` (no global needed) |

### Linux (Debian/Ubuntu/Mint) system deps for Tauri

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

## Install

```bash
git clone https://github.com/printezy247/EzyView.git
cd EzyView
npm install
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | launch the desktop app with hot reload |
| `npm run build:web` | build the renderer to static `apps/desktop/dist` |
| `npm run build:desktop` | full Tauri bundle (`.AppImage` / `.deb` on Linux) |
| `npm run lint` | oxlint over the whole workspace |
| `npm run format` | oxfmt |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | vitest unit tests |

## Install the .deb (Linux Mint / Ubuntu / Debian)

```bash
npm run tauri -- build --bundles deb
sudo apt install ./apps/desktop/src-tauri/target/release/bundle/deb/EzyView_0.1.0_amd64.deb
```

## MCP server (for Claude and other AI clients)

EzyView ships a stdio MCP server exposing candles, indicators, option pricing, a screener,
the economic calendar and earnings. It needs Node 22+. After installing the `.deb`:

```bash
claude mcp add ezyview -- node /usr/lib/EzyView/mcp/ezyview-mcp.mjs
```

From a source checkout: `npm run build:mcp`, then point `node` at `packages/mcp-server/dist/ezyview-mcp.mjs`.

## Multi-monitor

View → **Open chart in new window** opens the current chart in its own window; drag it to any monitor.

## Live fundamentals (free API keys)

Without keys, the Fundamentals panel shows offline **demo data**, marked by a yellow `DEMO DATA` badge.
With keys it shows live data, marked by a green `LIVE · <provider>` badge.

| Provider | What it powers | Free plan |
| --- | --- | --- |
| Finnhub | News, earnings, IPO calendar, dividends* | 60 requests / minute |
| Alpha Vantage | Company profile, dividends, earnings (if no Finnhub key) | 25 requests / day |

\* Finnhub's dividend endpoint is paid on some plans. When it refuses, EzyView uses Alpha Vantage
for dividends (if that key is set) instead.

1. **Finnhub key**: go to <https://finnhub.io/register>, sign up with your email and confirm it.
   Your key appears on the dashboard (<https://finnhub.io/dashboard>) as "API key". Copy it.
2. **Alpha Vantage key**: go to <https://www.alphavantage.co/support/#api-key>, fill in the short
   form (choose "Individual" / "Investor"), click **GET FREE API KEY** and copy the key it shows.
3. Open EzyView, open the **Fundamentals** panel, and click **API keys** (key icon, top right of the panel).
4. Paste each key into its box and click **Save**. "Key saved · live" means it worked.
5. Close the dialog. The tabs reload with live data. Pick a stock symbol (for example `AAPL`) for
   earnings, profile and dividends; crypto and forex symbols get crypto/forex news only.

Where the keys go: your system keyring (GNOME Keyring / KWallet on Linux, Keychain on macOS,
Credential Manager on Windows), under the service name `EzyView`. They are never written to a file,
to `localStorage`, or to the repo. To remove a key, click **Remove** in the same dialog. Keys can only
be saved in the desktop app; the browser preview (`npm run dev` in a plain browser) always uses demo data.

The economic calendar stays demo for now: Finnhub's is a paid endpoint and Alpha Vantage has none.

If a tab says "Could not load: … API key rejected", re-copy the key. "request limit reached" means the
free plan's limit was hit; wait a minute (Finnhub) or until tomorrow (Alpha Vantage).

## MT5 bridge (Linux)

MetaTrader 5 runs in Wine (`~/.mt5`). The MT5 bridge is a Python service that runs **inside the
Wine prefix** (or on a Windows host) and exposes REST. See `apps/mt5-bridge/README.md` (arrives in P5).

## Repository layout

```
apps/desktop/       Tauri v2 shell + React renderer (primary app)
apps/mt5-bridge/    Python MT5 bridge (P5)
packages/
  data-adapters/    market data / trading / fundamentals contracts + adapters
  indicators/       pure indicator math
  chart-engine/     lightweight-charts wrappers + panes
  drawing-tools/    drawing model + geometry
  journal/          trading journal domain + stats
  pine-transpiler/  Pine v6 → JS compiler
docs/               architecture, research, plans
```

## Project state

Phases are documented in [`MASTERPLAN.md`](../MASTERPLAN.md). Each phase is merged to `main`.
