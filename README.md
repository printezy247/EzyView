# EzyView

Open-source, self-hosted TradingView-class trading terminal — built to exceed TradingView on openness, extensibility, and cost.

- **Charts**: GPU-friendly canvas charting (TradingView Lightweight Charts + custom engine), multi-pane, multi-chart layouts.
- **Indicators**: 50+ built-in + custom Pine Script v5/v6 (transpiled to JS/WASM).
- **Drawings**: full TradingView-style drawing tool suite with magnet, styling, object tree.
- **Editor**: Pine Script editor with autocomplete, lint, backtest.
- **Trading**: paper trading engine + live MT5 integration (via MT5 REST bridge on Windows/Wine).
- **Journal**: proper trading journal with stats, tags, screenshots, broker sync.
- **Fundamentals**: economic calendar (ForexFactory), news (Reuters/Investing), earnings, options.
- **Collaboration**: shareable chart links, embeddable widgets, real-time co-editing (later).

Status: **Planning phase — no code yet.** See [`MASTERPLAN.md`](MASTERPLAN.md).

## Reverse-engineering sources

- TradingView Desktop `tradingview_amd64.deb` (v3.4.1) analyzed with REA → `docs/tradingview-desktop-ui-labels.md`
- MetaTrader 5 installed on Linux via Wine (`~/.mt5`) per [MQL5 article 625](https://www.mql5.com/en/articles/625)
- Related OSS repos surveyed → `docs/research-repos.md`
