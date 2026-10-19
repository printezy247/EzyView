# Architecture

## Shape: one renderer, many pure packages

EzyView is a **Tauri v2 desktop app**. Tauri gives us a native window, filesystem, SQLite and a
secure IPC boundary; the renderer is a normal Vite + React + TypeScript bundle.

Everything worth keeping — indicators, drawing math, journal statistics, Pine compilation, market
data adapters — lives in `packages/` as **pure TypeScript with zero framework imports**. That is the
single most important rule in this codebase: packages never import React, never touch the DOM and
never call Tauri APIs. Consequences:

- every interesting algorithm is unit-testable with vitest in `node` (no jsdom needed),
- the same package powers the desktop app, the optional web build, and a future CLI/server,
- feature work stays reviewable because business logic and UI glue are physically separated.

`apps/desktop` is the only place where React, Tauri and CSS live.

## Data flow

```
┌────────────────────────── apps/desktop (renderer) ──────────────────────────┐
│  React UI (toolbar · panels · charts · dialogs)                             │
│        │ reads/writes                                                        │
│  zustand stores (workspace · charts · drawings · journal · connection)       │
│        │ calls                                                               │
│  pure packages (@ezyview/*)  ── indicators · drawing math · journal stats    │
│        │ asks for data via                                                   │
│  AdapterRegistry (packages/data-adapters)                                    │
└──────────────┬───────────────────────────────────────────────┬───────────────┘
               │ market data                                    │ commands / SQL
               ▼                                                ▼
   MarketDataAdapter                              Tauri plugins (shell · sql · dialog)
   · demo (offline, default)                      · SQLite for layouts/drawings/journal
   · ccxt   (crypto)                              · spawn & talk to the MT5 bridge
   · alpaca (stocks)
   · mt5    (forex, via bridge)
```

## Why an adapter registry

TradingView's power is that one chart can show anything. We get the same flexibility by making the
symbol universe a *union of providers* rather than a hard-coded feed. A symbol string is
`PROVIDER:LOCAL` (`BINANCE:BTCUSDT`, `DEMO:EURUSD`); `resolveProvider()` maps it back to the adapter.
Adding a broker is one file that implements `MarketDataAdapter` / `TradingAdapter` plus a
registration call — no chart code changes.

## Why desktop-first

MT5 and its Python bridge are Windows-native and already run here under Wine. A desktop shell lets
us own the process boundary (spawn the bridge, hold the SQLite database, ship one binary) without
deploying anything. The renderer is host-agnostic, so `npm run build:web` still produces a static
bundle for anyone who wants to self-host.

## Storage

Local state is split deliberately:

- **Ephemeral (zustand, memory):** live quotes, hover state, unsaved edits.
- **Durable (SQLite via `tauri-plugin-sql`):** saved layouts, drawings, journal entries, alerts,
  settings. Keyed by workspace so multi-window stays consistent.
- **Secrets:** API keys go in the OS keyring (Tauri secure storage), never in SQLite.

## Layering rules

1. `packages/*` depend only on `packages/*`. Never on `apps/*`.
2. `apps/*` may depend on `packages/*` and on each other's public types only.
3. No `any` at a package boundary — every exported function is fully typed.
4. Adapters never throw on health checks; they degrade to `false`/`null` so the UI can show status.

## Testing strategy

- **Unit (vitest, `node`):** all of `packages/*` — indicator math against known values, drawing
  geometry, journal statistics, Pine transpilation, adapter determinism.
- **Integration (vitest):** store + adapter wiring with the demo feed.
- **E2E (Playwright, later):** chart renders, drawing is created, a paper order fills.
- **Rust:** `cargo check` in CI on every push.
