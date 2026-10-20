# Phase 1 — MT5 real-account login flow (plan)

Date: 2026-10-20 · Branch: `feat/phase-1-mt5-login` · Spec: `MASTERPLAN.md` §10 / §16

## Goal

Connect a real or demo MT5 account from inside EzyView: broker credential form → OS
keyring → bridge `POST /connect` → account panel, with mandatory safety rails
(confirmations, max order size, symbol allow-list, dry-run, audit log, single-use
approval tokens) on every MT5 trade action.

## Locked decisions

1. **Credential storage.** Password goes to the OS keyring only, account name
   `mt5:<login>@<server>` (Rust `key_entry` pattern-validated: charset
   `[A-Za-z0-9._@+-]`, length-capped). Non-secret metadata (server, login, demo flag)
   persists in `localStorage` under `ezyview.mt5.accounts.v1`. The Rust commands stay
   `api_key_get`/`api_key_set` — no new commands, same allow-list choke point.
2. **Session token.** `POST /connect` returns a bridge-generated `session` id; the app
   keeps it in memory only. `POST /disconnect` drops it. A mismatched session id on a
   write is rejected (prevents trading on a terminal the app did not log into).
3. **Audit log lives in the bridge.** `tools/mt5-bridge/audit.db` (stdlib `sqlite3`),
   one row per attempt (connect, disconnect, order, close, cancel, modify) with
   `ts, event, login, server, symbol, volume, price, result, error`. No credentials,
   ever — password is never stored in a variable longer than the `mt5.initialize`
   call and is redacted from error strings. `GET /audit?limit=N` serves the panel.
4. **Safety rails are pure and app-side** (`apps/desktop/src/tradingSafety.ts`):
   max order volume, symbol allow-list (empty = all allowed + warning), dry-run,
   confirmation requirement keyed by account kind (real always confirms; demo confirms
   above the size cap). A single-use approval token is minted on confirm and consumed
   on submit; a second submit without re-confirmation is blocked.
5. **Dry-run is enforced at the bridge too.** `{dry_run: true}` on `/order`/`/close`/
   `/cancel`/`/modify` runs every validation and returns `{ok: true, dry_run: true}`
   without touching `order_send`. Defence in depth, and it gives the audit log a
   "would-have" row.
6. **Real-account risk gate.** Adding or connecting a non-demo account requires the
   "I understand" confirmation dialog. The checkbox is the only path through.
7. **Chart source toggle** already exists (`useMt5.setSource`, status bar) and keeps
   its attach-to-running-terminal behaviour. New in this phase: when the MT5 source
   comes online with a *real* (non-demo) account, switching requires the "I
   understand" risk confirmation keyed to that login; declining leaves the feed on
   the EzyView demo source.

## Files

| File | Change |
|---|---|
| `tools/mt5-bridge/bridge.py` | `/connect`, `/disconnect`, `/audit`, session check, `dry_run`, SQLite audit, password redaction |
| `apps/desktop/src-tauri/src/lib.rs` | `key_entry` accepts `mt5:<login>@<server>` + tests |
| `packages/mt5-adapter/src/transport.ts` | `connect`/`disconnect`/`audit` on the interface + bridge impl; MCP throws unsupported |
| `packages/mt5-adapter/src/adapter.test.ts` | tests for the new transport calls |
| `apps/desktop/src/tradingSafety.ts` (+ `.test.ts`) | pure rails, tokens, redaction, masked login |
| `apps/desktop/src/mt5Accounts.ts` (+ `.test.ts`) | accounts store, keyring get/set, connect/disconnect/forget, session |
| `apps/desktop/src/Mt5Setup.tsx` | Brokers + Safety sections, add-account form, account summary |
| `apps/desktop/src/trading.ts` | gate MT5 submits through `tradingSafety`; confirmation + dry-run + token |
| `apps/desktop/src/TradingPanel.tsx` / `App.tsx` | confirm dialog surface for pending MT5 actions |
| `MASTERPLAN.md` | Phase 1 → done, §8 gap line, §10 status |

## Out of scope (deferred)

- Position/order price-line overlay on the chart (Phase 4 — charting controls).
- Multi-broker account switching UI polish and `/settings` route (Phase 2).
- Bridge-side volume/allow-list enforcement config (kept minimal: session + dry-run).

## Test plan

- Rust: `key_entry` accept/reject table (`mt5:4123@MetaQuotes-Demo` ok, `../etc`,
  `mt5:` alone, over-long names rejected).
- Adapter: `connect` posts creds and returns account; `disconnect`/`audit`; MCP
  transport throws.
- tradingSafety: block over cap, warn on empty allow-list, demo vs real confirmation
  matrix, token mint/consume/single-use, redaction of `password` keys.
- mt5Accounts: keyring round-trip with stubbed `invoke`, metadata persistence excludes
  passwords, forget deletes the keyring entry.
- Bridge: `python3 -m py_compile`; audit row shape asserted by a small stdlib test
  that stubs `MetaTrader5` (skip if the stub fights the import — py_compile +
  manual note).
