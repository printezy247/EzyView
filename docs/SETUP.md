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
