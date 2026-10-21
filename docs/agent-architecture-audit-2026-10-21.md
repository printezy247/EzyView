# EzyView Agent-Architecture Audit + Upgrade Roadmap

Date: 2026-10-21 · Scope: full repo (packages/*, apps/desktop, tools/mt5-bridge) · Method: 12-layer agent-architecture audit + research-repo/deferred-items survey. No code changed.

## Executive verdict

Overall health: **high risk in two isolated hotspots (Pine transpiler sandbox, alert persistence), medium elsewhere**. The chart core, journal stats, MT5 secret handling, and MCP snapshot transport are solid. The two load-bearing gaps are (1) Pine runs user code via `new Function` in the host realm with `unsafe-eval` CSP, and (2) alerts/watchlist are not persisted, so price alerts never survive a reload. Both are P0.

Most urgent fix: **remove `new Function` from `packages/pine-transpiler/src/evaluate.ts`** (or gate it behind a worker + allowlist) and add `alerts`/`alertHistory`/`watchlist` to the store's `partialize`. These close the two Critical/High findings without touching the chart.

## 1. Severity-ranked findings

### Critical

| # | Title | Layer | Evidence | Fix |
|---|---|---|---|---|
| C1 | Pine: arbitrary global access / code execution via `new Function` in host realm; CSP `unsafe-eval` | transpiler/evaluate + Tauri CSP | `packages/pine-transpiler/src/evaluate.ts:26-43`; `transpile.ts:254-255,396-399`; `tauri.conf.json:29` | Run generated code in an isolated worker with a restricted global; or rewrite emitter to reject non-allowlisted identifiers/members; deny `constructor`/`__proto__`/`prototype`. Then drop `unsafe-eval` from CSP. |

### High

| # | Title | Layer | Evidence | Fix |
|---|---|---|---|---|
| H1 | Pine: unbounded loops + zero-step infinite loop (`by 0`) freezes main thread | transpiler | `transpile.ts:213-225` | Validate step != 0; inject max-iteration guard; cap bars. |
| H2 | Pine: sync main-thread execution (DoS) for scripts + 500-combo optimizer | evaluate + desktop | `evaluate.ts:43`; `PineEditor.tsx:213,500-512` | Web Worker + timeout; stream optimize progress. |
| H3 | MCP: unvalidated JSON-RPC envelope → unhandled rejection on primitive/array input | transport + handler | `stdio.ts:7-20`; `server.ts:284-300` | Validate msg is object with string method; wrap dispatch in try/catch; reply -32600/-32602. |
| H4 | MCP: stale watchlist prices; failed snapshot writes never retried | writer | `apps/desktop/src/snapshot.ts:77-111` | Heartbeat/price-threshold rewrite or periodic flush; reschedule on failure with backoff; surface `updatedAt` age. |
| H5 | Alerts: alerts/watchlist not persisted (`partialize` omits them) | store | `store.ts:769-786` | Add `alerts`, `alertHistory`, `watchlist` to partialize (or migration). |
| H6 | Alerts: `once_per_bar_close` never fires from live feed; `once_per_bar` never re-arms | alerts + feed | `alerts.ts:119-141`; `alertFeed.ts:39`; `store.ts:599-617` | Track bar id in evaluateAlert; re-arm on new bar; pass barClosed based on period boundary. |
| H7 | Alerts: polling intervals reset every 3-5s because effect deps include the `watchlist` array | components | `Watchlist.tsx:52`; `HeatmapTab.tsx:39`; `ScreenerTab.tsx:43` | Depend on stable symbol key string instead of array. |
| H8 | MT5: bridge has no auth, no origin check, CORS `*` | bridge | `tools/mt5-bridge/bridge.py:288-305,370-371` | Bind 127.0.0.1 (done), per-launch bridge token on every request, restrict/drop CORS, rate limit. |
| H9 | MT5: safety rails client-side only; bridge enforces session, not volume/symbol/allow-list | bridge + TS | `bridge.py:560-636`; `tradingSafety.ts:52-87` | Replicate max volume + allow-list + dry-run in `_order`/`_close`, or require signed rail attestation. |
| H10 | MT5: real-account double confirm bypassable when no in-app session (legacy env login) | accounts | `mt5Accounts.ts:266-269`; `tradingSafety.ts:74-85` | Derive account kind from broker `tradeMode`; block/confirm when unknown. |

### Medium

| # | Title | Evidence | Fix |
|---|---|---|---|
| M1 | MCP: `journal_review_pack` not hardened against hostile rows (null guards) | `server.ts:259-260` vs `242-245` | Add null/shape guards; skip malformed rows for entries and notes. |
| M2 | MCP: no bounds/timeouts/backpressure on transport/tools | `stdio.ts:6`; `server.ts:76,108,239` | Cap line length; tool timeout; clamp output payload; AbortController. |
| M3 | MCP: prompt-only tool discipline; no code-gated freshness | `server.ts:250-252,216-219` | Compute/report snapshot age; document staleness. |
| M4 | MCP: input validation gaps (non-positive days/vol/rate; casts; no str length cap) | `server.ts:154-200,43-45` | Validate positivity/ranges/enums; cap string length. |
| M5 | MCP: concurrency/async safety (shared instances, fire-and-forget dispatch) | `server.ts:39-41`; `stdio.ts:17` | Ensure adapters stateless or add locking; await dispatch with errors. |
| M6 | MCP: transport write/backpressure + shutdown (EPIPE unhandled) | `stdio.ts:14,18` | Handle write errors; exit cleanly on stdin close. |
| M7 | Alerts: `startAlertFeed` cleanup discarded; module `busy` can stick true | `alertFeed.ts:28,50-53`; `main.tsx:36` | Store disposer; clear on unmount; add timeout/abort to tick. |
| M8 | Alerts: alert history grows per poll, not per bar | `store.ts:603-608`; `alertFeed.ts:8-9` | Document or track bar id; count bars not polls. |
| M9 | Alerts: tape buffers leak across session (no eviction) | `tapeStore.ts:24-25,60-66` | Evict LRU or cap map size. |
| M10 | Alerts: cross-tab crosshair sync unthrottled | `ChartPage.tsx:124`; `crosshairBus.ts:38-40` | Throttle broadcasts (e.g. 60fps / rAF). |
| M11 | MT5: close-all skips volume/symbol rails | `trading.ts:253` | Gate per row or pass aggregate volume/symbols. |
| M12 | MT5: bridge accepts NaN/Inf volume | `bridge.py:564-565` | Reject non-finite with `math.isfinite`. |
| M13 | MT5: MCP key can be sent over plaintext if URL non-HTTPS | `mcp.ts:129-130`; `mt5.ts:65-68` | Require HTTPS for non-localhost MCP URLs (or warn/refuse). |
| M14 | MT5: no request timeouts on MCP fetch | `mcp.ts:134-137` | Add AbortController timeout. |
| M15 | MT5: stale client session after bridge restart (401 not cleared) | `transport.ts:99`; `mt5Accounts`/`mt5` | On 401 clear session and trigger reconnect/probe. |
| M16 | Pine: prototype/namespace escape via MemberExpr | `transpile.ts:254-255,319-393` | Whitelist (namespace, property) pairs; block constructor/prototype/__proto__. |
| M17 | Pine: missing input validation / resource caps | `evaluate.ts:24-45`; `backtest.ts:40-53`; `optimize.ts:34,52-66` | Validate ctx shape; cap orders/series; per-run timeout. |

### Low

| # | Title | Evidence | Fix |
|---|---|---|---|
| L1 | Pine: numeric literal edge values (NaN/Infinity) | `lexer.ts:132-141`; `transpile.ts:244-245` | Reject non-finite literals at lex/parse. |
| L2 | Alerts: `liveAlerts` polls triggered `once_per_bar` indefinitely | `alertFeed.ts:17-21` | Add re-arm/expiry (covered by H6). |
| L3 | MT5: audit log has no client-side rail decisions; MCP transport unaudited | `tradingSafety.ts`; `mcp.ts` | Log gate blocks locally or send `blocked` audit event; document MCP unaudited. |
| L4 | MT5: `McpClient` trusts `mcp-session-id` from response headers | `mcp.ts:145-146` | Ignore unexpected session ids or pin to handshake origin. |
| L5 | MCP: minor (str length cap, enum validation) folded into M4. | — | — |

## 2. Architecture diagnosis (12-layer mapping)

| Layer | Finding | Root cause |
|---|---|---|
| 1 System prompt | MCP tool descriptions carry discipline ("write narrative yourself"); not enforced in code | Prompt-only contracts |
| 4 Distillation | Snapshot `updatedAt` returned but no staleness threshold/enforcement | No code-gated freshness |
| 6 Tool selection | MCP `screen` casts `field`/`sortBy`; `economic_calendar` casts `impact` | Trust boundary not validated |
| 7 Tool execution | `journal_review_pack` filters deref `e.entryTime`/`n.time` without null guards → throws on malformed rows | Hostile-row guards inconsistent (`get_journal` has them, `journal_review_pack` doesn't) |
| 8 Tool interpretation | `get_candles` limit clamped 1-1000; `run_indicator` tail 1-500; OK | — |
| 10 Platform rendering | stdio JSON-RPC framing; `process.stdout.write` return ignored (EPIPE) | Transport write errors unhandled |
| 11 Hidden repair loops | `alertFeed.tick` swallows errors via `.catch(() => null)`; no retry/backoff | Silent failure |
| 12 Persistence | Alerts/watchlist not in `partialize`; snapshot writes swallowed with no retry | Stale state reused as live |

Pine layer is a separate sandbox boundary (not in the 12-layer agent stack but a code-execution boundary): user Pine → `new Function` → host realm. Critical.

MT5 layer: safety rails live only in the renderer (zustand store), not the bridge. A direct caller or compromised renderer bypasses them. High.

## 3. Strengths (do not regress)

- Secrets: passwords only in OS keyring (`lib.rs` `API_KEY_NAMES` + `mt5:` account names validated; `parseAccounts` rejects blobs containing `password`; `mt5.ts` strips `mcpKey` from persisted settings and migrates legacy localStorage into keyring). Bridge redacts password from `_connect` errors and never writes to audit DB. Approval tokens single-use (`consume` deletes). Close-all serial to avoid same-symbol races.
- MCP: tool failures reported in-band via `isError` (not thrown); atomic writer (temp + rename) with 20 MB cap; hostile-row guards + limit clamping in `get_journal`/`list_alerts`; `parseSnapshot` structural validation; NDJSON stays single-line.
- Alerts: pure `evaluateAlert`/`shouldTrigger` unit-tested; `applyCandle` keeps array identity when nothing changed; `mergeQuote` pure/identity-preserving; components consistently clear intervals with `cancelled` flags.
- Chart: `screenToTimePrice` validity helper; undo/redo; magnet tested; bounded tape buffer (200).
- Rust: 9 unit tests covering key names, log trim, window restore, proxy validation, shell settings, file names, MT5 account names, keyring round-trip (ignored).
- CI: lint + typecheck + test + web build + MCP build + desktop build + Playwright smoke; no vulnerabilities (`npm audit` clean).

## 4. Ordered fix plan (code-first)

### P0 (this sprint, before next release)

1. **Pine sandbox** (C1, H1, H2, M16, M17, L1): replace `new Function` with a worker-isolated evaluator or an allowlisted interpreter; validate step != 0; cap iterations/bars/orders; validate ctx shape; reject non-finite literals. Then remove `unsafe-eval` from CSP. Keep `object-src 'none'`, `frame-ancestors 'none'`.
2. **Alert persistence** (H5, H6, H7, M7, M8, L2): add `alerts`/`alertHistory`/`watchlist` to `partialize`; track bar id in `evaluateAlert` and re-arm `once_per_bar*` on new bar; pass `barClosed` from feed based on period boundary; change Watchlist/Heatmap/Screener effect deps to stable symbol key; store `startAlertFeed` disposer and clear on unmount; add timeout/abort to tick.
3. **MCP envelope + snapshot retry** (H3, H4, M1-M6): validate JSON-RPC envelope; wrap dispatch; cap line length; tool timeout; clamp output; handle write errors/exit on stdin close; retry failed snapshot writes with backoff; surface snapshot age.
4. **MT5 bridge auth + server-side rails** (H8, H9, H10, M11, M12, M13, M14, M15, L3, L4): per-launch bridge token on every request; restrict/drop CORS; rate limit; replicate max volume + allow-list + dry-run in `_order`/`_close`; reject non-finite volume; derive account kind from broker `tradeMode`; require HTTPS for non-localhost MCP URLs; add request timeouts; clear session on 401; log gate blocks.

### P1 (next cycle)

5. **Performance**: move indicator/Pine computation + optimizer to Web Worker; stream progress; batch chart updates; virtualize long lists; bound ring buffers.
6. **Testing**: coverage reporting (`@vitest/coverage-v8`) with threshold in CI; E2E journeys (drawing, paper order, alert trigger, MT5 mock bridge); `cargo test` in CI; property-based tests for pure math; visual baselines on pinned container.
7. **Features (deferred, high value)**: walk-forward optimization; Pine v6; multi-select drawings + trend-line-angle alerts; sessions/extended hours + chart templates; AI journal summary via `journal_review_pack`; MT5 auto-import depth; macro world-map overlay; publish marketplace (local bundles).

### P2 (polish/backlog)

8. **Security hardening**: SRI/integrity for bundled assets; lock `connect-src` to exact hosts; signed in-app updater (minisign keypair + `tauri-plugin-updater`); factory reset optionally wipe keyring secrets; keyring enumeration/delete in Settings → Data; harden `postMessage`/`BroadcastChannel` cross-window sync; size cap on `save_file` bytes.
9. **DX/deploy**: `npm audit` + `cargo audit` in CI; Renovate/Dependabot; release tags + release workflow; bundle size budget; API docs for `MarketDataAdapter`; `docs/SETUP.md` signing secrets.
10. **UX/a11y/i18n**: sound controls; global shortcuts beyond show-window; tab monitor; i18n (`react-i18next`); accessibility pass (keyboard nav, focus rings, screen-reader labels, `eslint-plugin-jsx-a11y`); opt-in telemetry + export bundle.

## 5. Upgrade ideas from research repos (selected)

Source: `docs/research-repos.md`. Filtered to items EzyView lacks and that are high-value/low-cost.

- **OpenCharts paper engine** (`dylanpersonguy/OpenCharts`): deepen `packages/paper-trading` (partial fills, slippage, fees) — currently $100k virtual, 100× leverage, no commission. Effort M.
- **deltalytix AI journal** (`hugodemenez/deltalytix`): auto-tag setups, natural-language review; feeds `journal_review_pack` MCP tool + UI trigger. Effort M.
- **devilforcex/Metatrader safety patterns**: already borrowed (single-use approval tokens, audit log). Extend: per-account locks, risk veto thresholds. Effort S.
- **mt5api** (`dceoy/mt5api`): compare REST bridge contract; add missing endpoints (tester, history deals). Effort M.
- **PyTrader** (EA + websocket): lower-latency fallback transport for MT5 quotes. Effort L.
- **ForexFactory unofficial API** (`xclunderrated/ForexFactory-Unofficial-API`): already used; add caching + rate limits. Effort S.
- **CandleViewer GPU engine** (`basiltt/CandleViewer`): WebGL/OffscreenCanvas for 1M+ candles. Effort L.
- **TradingView lightweight-charts**: already the engine; ensure v5 features (series markers, price lines) used. Effort S.

## 6. Rulings made (none — this is a read-only audit)

No code changed. All findings are advisory. Jack picks priority/order; P0 items are recommended before the next release because two are Critical/High and one is a security boundary (Pine `new Function`).

## 7. Front-End Checklist reminder

Per Jack's standing reminder: the Front-End Checklist (frontendchecklist.io) covers HTML/CSS/JS/performance/accessibility/SEO/security/images. None of the audit findings above change rendered HTML/CSS directly, but the CSP change (P0 item 1) touches security headers and the accessibility items (P2) touch a11y. Offer to run a full Front-End Checklist audit once any UI/CSS change lands.
