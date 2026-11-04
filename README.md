<p align="center">
  <img src="https://img.shields.io/badge/release-0.4.0-2962ff?style=flat-square" alt="release">
  <img src="https://img.shields.io/badge/tests-1393-26a69a?style=flat-square" alt="tests">
  <img src="https://img.shields.io/badge/license-MIT-181c21?style=flat-square" alt="MIT license">
  <a href="https://github.com/printezy247/EzyView/actions/workflows/ci.yml"><img src="https://github.com/printezy247/EzyView/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-0ea600?style=flat-square" alt="platforms">
</p>

<p align="center">
  <svg width="640" height="160" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="EzyView — self-hosted trading terminal">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#181c21"/>
        <stop offset="1" stop-color="#10141a"/>
      </linearGradient>
      <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2962ff"/>
        <stop offset="1" stop-color="#26a69a"/>
      </linearGradient>
      <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#26a69a" stop-opacity="0.35"/>
        <stop offset="1" stop-color="#26a69a" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="638" height="158" rx="12" fill="url(#bg)" stroke="#2962ff" stroke-opacity="0.5"/>
    <g font-family="monospace">
      <text x="32" y="44" fill="#8b96a5" font-size="13" letter-spacing="3">SELF-HOSTED · OPEN SOURCE · TRADING TERMINAL</text>
      <text x="32" y="92" fill="#ffffff" font-size="44" font-weight="700" letter-spacing="1">Ezy<tspan fill="#26a69a">View</tspan></text>
      <text x="32" y="126" fill="#8b96a5" font-size="14">TradingView-class charts · Pine Script · MT5 · paper trading</text>
    </g>
    <g stroke-width="2">
      <line x1="470" y1="118" x2="470" y2="142" stroke="#f23645"/><rect x="465" y="124" width="10" height="12" fill="#f23645"/>
      <line x1="490" y1="104" x2="490" y2="134" stroke="#26a69a"/><rect x="485" y="108" width="10" height="20" fill="#26a69a"/>
      <line x1="510" y1="92" x2="510" y2="124" stroke="#26a69a"/><rect x="505" y="96" width="10" height="22" fill="#26a69a"/>
      <line x1="530" y1="84" x2="530" y2="114" stroke="#f23645"/><rect x="525" y="92" width="10" height="14" fill="#f23645"/>
      <line x1="550" y1="66" x2="550" y2="102" stroke="#26a69a"/><rect x="545" y="70" width="10" height="26" fill="#26a69a"/>
      <line x1="570" y1="54" x2="570" y2="88" stroke="#26a69a"/><rect x="565" y="58" width="10" height="24" fill="#26a69a"/>
      <line x1="590" y1="44" x2="590" y2="74" stroke="#f23645"/><rect x="585" y="52" width="10" height="14" fill="#f23645"/>
      <line x1="610" y1="30" x2="610" y2="62" stroke="#26a69a"/><rect x="605" y="34" width="10" height="22" fill="#26a69a"/>
    </g>
    <path d="M430 130 L470 118 L510 100 L550 78 L590 60 L620 38" fill="none" stroke="url(#line)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M430 130 L470 118 L510 100 L550 78 L590 60 L620 38 L620 150 L430 150 Z" fill="url(#area)"/>
    <circle cx="620" cy="38" r="4" fill="#26a69a"/>
  </svg>
</p>

<p align="center">
  <b>Open-source, self-hosted TradingView-class terminal</b> — built to exceed TradingView on openness, extensibility, and cost.
</p>

---

## Features

| Market Data | Tooling |
|---|---|
| 📈 **Charts** — GPU canvas (Lightweight Charts + custom engine), multi-pane, drag stop/target, session breaks | 🧭 **Drawings** — full TradingView-style suite, magnet, styling, object tree |
| 📊 **Indicators** — 50+ built-ins + custom Pine Script v5/v6 (transpiled JS/WASM) | ✏️ **Editor** — Pine editor with autocomplete, lint, backtest |
| 💹 **Trading** — paper engine + live MT5 (REST bridge on Windows/Wine) | 📓 **Journal** — stats, tags, screenshots, broker sync |
| 🗓 **Research** — calendar, news, earnings, dividends, options, screener, heatmap | 🤝 **Collaboration** — shareable links, embeddable widgets, co-editing (later) |

Status **v0.4.0** · plan: [`MASTERPLAN.md`](MASTERPLAN.md) · brand: [`docs/superpowers/specs/2026-10-21-investing-com-brand-redesign.md`](docs/superpowers/specs/2026-10-21-investing-com-brand-redesign.md)

## Quick start

```bash
# Linux install — verify signature first
sha256sum -c SHA256SUMS --ignore-missing
sudo apt install ./EzyView_<version>_amd64.deb

# Development
npm ci
npm run dev                              # Tauri desktop
npm run dev --workspace apps/desktop     # web app on :1420
```

AppImage needs FUSE 2 (`libfuse2t64` on Mint 22 / Ubuntu 24.04); otherwise run `--appimage-extract-and-run`.
Desktop builds need Linux WebKit/GTK packages — exact list in CI workflow. Release process: [`docs/RELEASING.md`](docs/RELEASING.md).

## Verification

```bash
npm run test         # Vitest — 138 files, 1393 tests
npm run test:e2e     # Playwright — smoke + visual baselines
npm run lint         # oxlint
npm run typecheck    # tsc --noEmit
```

Smoke spec runs in CI. Visual baselines are local-only (CI font rasteriser differs from a dev machine).

## Reverse-engineering sources

- TradingView Desktop `tradingview_amd64.deb` (v3.4.1) analyzed with REA → `docs/tradingview-desktop-ui-labels.md`
- MetaTrader 5 on Linux via Wine (`~/.mt5`) per [MQL5 article 625](https://www.mql5.com/en/articles/625)
- Related OSS repos surveyed → `docs/research-repos.md`

## Third-party notices

EzyView's charting engine is built on **TradingView Lightweight Charts™** —
Copyright (с) 2025 TradingView, Inc. — <https://www.tradingview.com/>.

TradingView Lightweight Charts™ is licensed under the Apache License 2.0. That licence requires the attribution notice above with the source and a link to <https://www.tradingview.com/> on a page of the application available to its users. EzyView meets that requirement in Settings → Diagnostics → Third-party notices, and in the `NOTICE` file shipped with the source. Full notices: [`NOTICE`](NOTICE).

---

<p align="center">
  <sub>MIT © 2026 <a href="https://github.com/printezy247">printezy247</a> · <a href="https://github.com/printezy247/EzyView/releases/latest">Downloads</a> · <a href="https://github.com/printezy247/EzyView/issues">Issues</a></sub>
</p>
