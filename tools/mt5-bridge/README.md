# EzyView ↔ MetaTrader 5 bridge

A single-file REST server that attaches to a **running** MetaTrader 5 terminal
through the official `MetaTrader5` Python package and serves the JSON that
`@ezyview/mt5-adapter` expects. Works on Windows natively and under Wine (the
path EzyView is developed on).

## Why this exists

EzyView's renderer needs broker candles, quotes, account, positions and order
placement. Two transports provide that:

| Transport | Needs | Notes |
| --- | --- | --- |
| **Local bridge** (this file) | Windows Python + `pip install MetaTrader5` | Works wherever the terminal runs, including Wine |
| **Built-in MCP** | Nothing extra | `127.0.0.1:22346/mcp` + key from *Tools → Options → MCP*; MT5 builds where the generated key is rejected fall back to the bridge |

Pick the transport in-app: **MT5 setup** (status bar) → Local bridge / Built-in MCP.

## Setup

### Windows

```bat
py -3 -m pip install MetaTrader5
py -3 tools\mt5-bridge\bridge.py
```

### Linux from the EzyView package

The `.deb` ships this bridge and a launcher. It creates a per-install token at
`~/.config/ezyview/mt5-bridge.token` (0600) on first use and exports it to the
bridge:

```bash
ezyview-mt5-bridge            # start it (needs the Wine Python below)
ezyview-mt5-bridge --check    # ask the running bridge for /health
ezyview-mt5-bridge --token    # print the token for Settings → MT5 setup
```

The app also reads that file on startup, so the Bridge token field fills itself
in when the packaged launcher created it. Wine and MetaTrader 5 are **not**
bundled; install them yourself. The launcher explains what is missing.

### Linux (Wine prefix, manual)

```bash
# one-time: embeddable Python inside the prefix
unzip python-3.12.x-embed-amd64.zip -d "$WINEPREFIX/drive_c/ezyview-py"
printf 'python312.zip\n.\nLib\\site-packages\nimport site\n' > "$WINEPREFIX/drive_c/ezyview-py/python312._pth"
wine "$WINEPREFIX/drive_c/ezyview-py/python.exe" get-pip.py
wine "$WINEPREFIX/drive_c/ezyview-py/python.exe" -m pip install MetaTrader5

# run
wine "$WINEPREFIX/drive_c/ezyview-py/python.exe" Z:/path/to/tools/mt5-bridge/bridge.py
```

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `EZYVIEW_MT5_PORT` | `8765` | Listen port (127.0.0.1 only) |
| `EZYVIEW_MT5_TOKEN` | — | Shared secret every request must carry (header `X-Bridge-Token` or `?token=`) |
| `EZYVIEW_MT5_ALLOW_INSECURE` | — | Allow POST/write endpoints when no token is set (development only) |
| `MT5_PATH` | auto-detected | `terminal64.exe` path |
| `MT5_LOGIN` / `MT5_SERVER` / `MT5_PASSWORD` | — | Optional explicit login |
| `EZYVIEW_MT5_DEVIATION` | `20` | Slippage points on market orders |
| `EZYVIEW_MT5_VERBOSE` | — | Log every request |

### Locking the bridge down

The bridge can place real orders, so two things protect it:

- **CORS** — only the app's own origins (`tauri://localhost`, the dev server
  on port 1420) may talk to it. Any other page on this machine is refused.
- **Token** — set `EZYVIEW_MT5_TOKEN` and every request must carry it. The
  packaged launcher generates one and the app reads it automatically; a token
  pasted in *MT5 setup → Bridge token* is kept in your OS keyring, never in
  `localStorage`.

Without a token the bridge still answers reads on `127.0.0.1`, but **refuses
POST/write endpoints** — otherwise any program on this machine could place
orders. `EZYVIEW_MT5_ALLOW_INSECURE=1` restores the old behaviour for a
deliberate development setup; do not use it on a trading machine.

## Endpoints

```
GET  /health                    → { ok, connected, version, login, server }
GET  /symbols?q=                → { symbols: [{ symbol, description, digits, point, bid, ask, … }] }
GET  /history?symbol&tf&from&to → { rates: [{ time, open, high, low, close, tick_volume, … }] }
GET  /quote?symbol              → { symbol, bid, ask, time, digits }
GET  /account                   → MT5 account tuple
GET  /positions                 → { positions: [...], orders: [...] }
GET  /deals?from&to             → { deals: [...] }
POST /order   { symbol, side, type, volume, price?, sl?, tp? }
POST /close   { symbol, volume? }
POST /cancel  { ticket }
POST /modify  { ticket, sl?, tp? }
```

POST bodies may be sent as `text/plain` (what the app does, to keep the
request CORS-preflight-free) or `application/json`; the body is parsed as JSON
either way.

## Requirements on the terminal side

- Terminal running and logged in.
- **Algo Trading enabled** (toolbar toggle, green play). MT5 rejects external
  orders with `10027 AutoTrading disabled by client` while it is off — EzyView
  surfaces that message verbatim in the order ticket.
- Symbols must be addable to Market Watch (the bridge selects them for you).
