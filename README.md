# EzyView

Open-source, self-hosted TradingView-class trading terminal — built to exceed TradingView on openness, extensibility, and cost.

- **Charts**: GPU-friendly canvas charting (TradingView Lightweight Charts + custom engine), multi-pane, multi-chart layouts, draggable stop/target, session-break shading.
- **Indicators**: 50+ built-in + custom Pine Script v5/v6 (transpiled to JS/WASM).
- **Drawings**: full TradingView-style drawing tool suite with magnet, styling, object tree.
- **Editor**: Pine Script editor with autocomplete, lint, backtest.
- **Trading**: paper trading engine + live MT5 integration (via MT5 REST bridge on Windows/Wine).
- **Journal**: proper trading journal with stats, tags, screenshots, broker sync.
- **Research**: economic calendar, news, earnings, dividends, options, screener, heatmap.
- **Collaboration**: shareable chart links, embeddable widgets, real-time co-editing (later).

Status: **v0.3.1.** See [`MASTERPLAN.md`](MASTERPLAN.md) for the full plan and
[`docs/superpowers/specs/2026-10-21-investing-com-brand-redesign.md`](docs/superpowers/specs/2026-10-21-investing-com-brand-redesign.md)
for the Investing.com brand redesign.

## Install (Linux)

Download the `.deb` from [Releases](https://github.com/printezy247/EzyView/releases/latest)
and verify it against the published `SHA256SUMS`:

```bash
sha256sum -c SHA256SUMS --ignore-missing
sudo apt install ./EzyView_<version>_amd64.deb
```

The portable AppImage needs FUSE 2 (`libfuse2t64` on Mint 22 / Ubuntu 24.04);
without it use `--appimage-extract-and-run`. See [`docs/RELEASING.md`](docs/RELEASING.md)
for the release and update process.

## Running it

```bash
npm ci
npm run dev          # the Tauri desktop app
npm run dev --workspace apps/desktop   # the web app alone, on :1420
```

Desktop builds need the Linux WebKit/GTK packages; see the CI workflow for the
exact list.

## Tests

```bash
npm run test         # Vitest: 96 files, 870 tests
npm run test:e2e     # Playwright: smoke + visual baselines
```

The smoke spec runs in CI. The visual baselines are a local tool — they
compare rendered pixels, and a CI runner's font rasteriser is not a developer's.

## Reverse-engineering sources

- TradingView Desktop `tradingview_amd64.deb` (v3.4.1) analyzed with REA → `docs/tradingview-desktop-ui-labels.md`
- MetaTrader 5 installed on Linux via Wine (`~/.mt5`) per [MQL5 article 625](https://www.mql5.com/en/articles/625)
- Related OSS repos surveyed → `docs/research-repos.md`

## Third-party notices

EzyView's charting engine is built on **TradingView Lightweight Charts™** —
Copyright (с) 2025 TradingView, Inc. — <https://www.tradingview.com/>.

TradingView Lightweight Charts™ is licensed under the Apache License 2.0. That
licence requires the attribution notice above to be included with the source
and a link to <https://www.tradingview.com/> on a page of the application
available to its users. EzyView meets that requirement in Settings →
Diagnostics → Third-party notices, and in the `NOTICE` file shipped with the
source. Full notices are in [`NOTICE`](NOTICE).
