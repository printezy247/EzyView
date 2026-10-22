# Extra live price sources (Binance, Kraken, Twelve Data) — design

Date: 2026-10-22 · Owner: printezy247 · Status: approved by answers below, building

## Why

EzyView has two chart feeds today: the demo feed and Broker · MT5 (global switch). The only other public source is a hard-wired Binance 24h ticker. Jack wants more live-price options that do not need the MT5 bridge, picked from the public-apis catalogue.

## Decisions (Jack's answers, 2026-10-22)

- **Providers**: crypto from Binance and Kraken public market data (no key); gold and forex (XAUUSD, EURUSD, ...) from Twelve Data with a free API key kept in the OS keyring.
- **Picker**: a per-chart data-source dropdown in the chart toolbar. Default `auto` follows the global feed switch, so existing layouts behave as before.
- **Orders**: MT5 orders stay available when a chart uses another source. The ticket and chart Buy/Sell show a warning ("chart price is from X, MT5 fills at the broker's price"). Paper trading is unchanged.
- **Updates**: WebSocket where the provider offers one (Binance, Kraken, Twelve Data), with automatic fallback to polling.

## Shape

`packages/data-adapters/src/liveFeeds.ts` exports `createLiveSources(deps)`; each source implements the existing `MarketDataAdapter` (`getHistory`, `getQuote`, `subscribe`, `searchSymbols`) plus `supports(symbol)` and `label`. Dependencies (`fetch`, `WebSocket`, `getKey`) are injected so tests run with fakes.

| id | History | Live | Symbols |
| --- | --- | --- | --- |
| `binance` | `data-api.binance.vision/api/v3/klines` | `wss://stream.binance.vision/ws/<pair>@bookTicker` | `*USDT` crypto pairs |
| `kraken` | `api.kraken.com/0/public/OHLC` | `wss://ws.kraken.com/v2` ticker | `BTC/USD`-style pairs |
| `twelvedata` | `api.twelvedata.com/time_series` | `wss://ws.twelvedata.com/v1/quotes/price`, else REST `/price` polled no faster than every 8 s | forex pairs, XAUUSD, XAGUSD |

Free Twelve Data limits (about 8 requests/minute, 800/day) are why its polling fallback is throttled. Candle updates on that source can lag by seconds; this is stated in the UI help text.

## App wiring (apps/desktop)

- `ChartState.dataSource?: "auto" | "demo" | "mt5" | "binance" | "kraken" | "twelvedata"`, optional so old saves load.
- `data.ts`: `quoteOf` / `loadHistory` take the chart's source; `auto` keeps today's behaviour.
- `ChartHost` live polling uses the chart's source; WebSocket sources push into the same `mergeQuote` path.
- Toolbar dropdown lists only usable sources (Twelve Data greyed until a key is saved in the API keys dialog).
- CSP `connect-src` gains the three hosts and their `wss://` endpoints.

## Non-goals

No new order routing, no MT5 changes, no paid data tiers, no tick-by-tick volume.

## Known limits

- Twelve Data WebSocket availability on the free plan is unverified; the polling fallback covers it.
- Gold on Binance is only the PAXG token proxy; real XAUUSD comes from Twelve Data.
- Not tested against live providers in CI; unit tests use fakes.
