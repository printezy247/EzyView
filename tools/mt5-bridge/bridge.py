"""
EzyView ↔ MetaTrader 5 bridge.

A single-file REST server (stdlib only) that attaches to a running terminal
through the official `MetaTrader5` API and speaks the JSON shapes EzyView's
`@ezyview/mt5-adapter` expects. It works under Wine and on native Windows.

Run:
    wine C:\\ezyview-py\\python.exe Z:\\path\\to\\bridge.py
Env:
    EZYVIEW_MT5_PORT   listen port (default 8765)
    EZYVIEW_MT5_AUDIT  audit SQLite path (default: audit.db next to this file)
    MT5_PATH           terminal64.exe path (auto-detected when unset)
    MT5_LOGIN/SERVER/PASSWORD   optional re-login (legacy attach; the app's
                       in-account login uses POST /connect instead)

Endpoints: /health /symbols /history /quote /account /positions /deals /audit
GET, and /connect /disconnect /order /close /cancel /modify POST. Writes accept
`dry_run: true` to validate without touching the terminal; while a /connect
session is live, writes must carry its `session` id.
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import MetaTrader5 as mt5

PORT = int(os.environ.get("EZYVIEW_MT5_PORT", "8765"))
HOST = "127.0.0.1"
AUDIT_DB = os.environ.get(
    "EZYVIEW_MT5_AUDIT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit.db")
)

# Optional shared secret token and server-side safety limits.
BRIDGE_TOKEN = os.environ.get("EZYVIEW_MT5_TOKEN", "").strip()
MAX_ORDER_VOLUME = float(os.environ.get("EZYVIEW_MT5_MAX_VOLUME", "50.0"))
SYMBOL_ALLOW_LIST = [
    s.strip().upper()
    for s in os.environ.get("EZYVIEW_MT5_ALLOW_SYMBOLS", "").split(",")
    if s.strip()
]

ALLOWED_ORIGINS = {
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

RATE_LOCK = threading.Lock()
RATE_WINDOW_SEC = 1.0
RATE_MAX_REQ = 60
_rate_buckets: dict[str, list[float]] = {}


def check_rate_limit(ip: str) -> bool:
    now = time.monotonic()
    with RATE_LOCK:
        stamps = [t for t in _rate_buckets.get(ip, []) if now - t < RATE_WINDOW_SEC]
        if len(stamps) >= RATE_MAX_REQ:
            _rate_buckets[ip] = stamps
            return False
        stamps.append(now)
        _rate_buckets[ip] = stamps
        return True

# In-app login session (Phase 1): minted by /connect, dropped by /disconnect.
# While it is None the bridge keeps its legacy attach-to-terminal behaviour;
# while set, trade writes must carry the matching session id.
SESSION: str | None = None
SESSION_ACCOUNT: dict | None = None
DEFAULT_PATHS = [
    r"Z:\home\jack\.mt5\drive_c\Program Files\MetaTrader 5\terminal64.exe",
    r"C:\Program Files\MetaTrader 5\terminal64.exe",
    r"C:\Program Files (x86)\MetaTrader 5\terminal64.exe",
]

# MT5's python module is single-threaded IPC: one call at a time, always.
LOCK = threading.Lock()
_last_error: str | None = None

TIMEFRAMES = {
    "S1": mt5.TIMEFRAME_M1, "S5": mt5.TIMEFRAME_M5, "S15": mt5.TIMEFRAME_M15, "S30": mt5.TIMEFRAME_M30,
    "M1": mt5.TIMEFRAME_M1, "M2": mt5.TIMEFRAME_M2, "M3": mt5.TIMEFRAME_M3, "M4": mt5.TIMEFRAME_M4,
    "M5": mt5.TIMEFRAME_M5, "M6": mt5.TIMEFRAME_M6, "M10": mt5.TIMEFRAME_M10, "M12": mt5.TIMEFRAME_M12,
    "M15": mt5.TIMEFRAME_M15, "M20": mt5.TIMEFRAME_M20, "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1, "H2": mt5.TIMEFRAME_H2, "H3": mt5.TIMEFRAME_H3, "H4": mt5.TIMEFRAME_H4,
    "H6": mt5.TIMEFRAME_H6, "H8": mt5.TIMEFRAME_H8, "H12": mt5.TIMEFRAME_H12,
    "D1": mt5.TIMEFRAME_D1, "W1": mt5.TIMEFRAME_W1, "MN1": mt5.TIMEFRAME_MN1,
}


def _num(value):
    """numpy scalars and NaN → plain JSON-safe numbers."""
    try:
        value = value.item()
    except AttributeError:
        pass
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return 0.0
        return value
    # `.item()` on a structured record yields a tuple; never leak it out.
    if isinstance(value, tuple):
        return tuple(_num(v) for v in value)
    return value


def ser(value):
    """MT5 namedtuples/numpy records/dates → JSON."""
    if value is None or isinstance(value, (str, bool)):
        return value
    if hasattr(value, "_asdict"):
        return {k: ser(v) for k, v in value._asdict().items()}
    # numpy structured records (rates, symbol rows) unpack by field name.
    names = getattr(getattr(value, "dtype", None), "names", None)
    if names:
        return {name: ser(value[name]) for name in names}
    if isinstance(value, (list, tuple, set)):
        return [ser(v) for v in value]
    if isinstance(value, dict):
        return {k: ser(v) for k, v in value.items()}
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp())
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    try:
        return _num(value)
    except Exception:
        return str(value)


def terminal_path():
    """Terminal executable, from env or the usual install spots (Wine drive first)."""
    return os.environ.get("MT5_PATH") or next((p for p in DEFAULT_PATHS if os.path.exists(p)), None)


def connect() -> bool:
    global _last_error
    with LOCK:
        path = terminal_path()
        kwargs = {"timeout": 15000}
        if path:
            kwargs["path"] = path
        ok = bool(mt5.initialize(**kwargs))
        if not ok:
            _last_error = str(mt5.last_error())
            return False
        login = os.environ.get("MT5_LOGIN")
        if login and os.environ.get("MT5_PASSWORD"):
            mt5.login(
                int(login),
                password=os.environ["MT5_PASSWORD"],
                server=os.environ.get("MT5_SERVER", ""),
            )
        _last_error = None
        return True


def seq(value):
    """None → []. Never use `or []`: numpy arrays raise on truth-testing."""
    return [] if value is None else list(value)


# --- audit log (Phase 1: one row per action attempt, no credentials) --------
AUDIT_LOCK = threading.Lock()
AUDIT_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  event TEXT NOT NULL,
  login TEXT,
  server TEXT,
  symbol TEXT,
  volume REAL,
  price REAL,
  result TEXT,
  error TEXT,
  detail TEXT
)
"""


def _open_audit():
    db = sqlite3.connect(AUDIT_DB)
    try:
        db.execute(AUDIT_SCHEMA)
    except Exception:
        db.close()
        raise
    return db


def audit(event, login=None, server=None, symbol=None, volume=None, price=None, result=None, error=None, detail=None):
    """Append one action row. The password never appears here by construction:
    only the account number, server, symbol, size, price and outcome do."""
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        with AUDIT_LOCK:
            db = _open_audit()
            try:
                db.execute(
                    "INSERT INTO audit (ts, event, login, server, symbol, volume, price, result, error, detail)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (ts, event, str(login) if login is not None else None, server, symbol, volume, price, result, error, detail),
                )
                db.commit()
            finally:
                db.close()
    except Exception as err:  # auditing must never take down a trade path
        sys.stderr.write(f"audit write failed: {err}\n")


def audit_rows(limit=50):
    limit = max(1, min(int(limit), 500))
    with AUDIT_LOCK:
        db = _open_audit()
        try:
            db.row_factory = sqlite3.Row
            rows = db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        finally:
            db.close()
    return [dict(r) for r in rows]


def redact(message, *secrets):
    """Scrub any secret that leaked into an error string before it leaves the bridge."""
    text = str(message)
    for secret in secrets:
        if secret:
            text = text.replace(str(secret), "***")
    return text


def _account_ref():
    """(login, server) of the attached account, for audit rows."""
    with LOCK:
        account = mt5.account_info()
    return (account.login if account else None, account.server if account else None)


def ensure_connected() -> bool:
    """Reattach when the terminal was restarted underneath us.

    The terminal comes and goes (crash, update, user restart) while the bridge
    stays up, so every request checks liveness once and reconnects on a miss
    instead of failing until someone restarts the bridge too.
    """
    with LOCK:
        if mt5.terminal_info() is not None:
            return True
    return connect()


def _name(info) -> str:
    """Build 6244 names the field `name`; older builds use `symbol`."""
    return getattr(info, "symbol", None) or getattr(info, "name", None) or ""


def ensure_symbol(symbol: str) -> bool:
    info = mt5.symbol_info(symbol)
    if info is None:
        return False
    if not info.visible:
        mt5.symbol_select(symbol, True)
    return True


def filling_mode(info) -> int:
    """First supported filling policy, when the build exposes it.

    Build 6244 drops `trade_fill_mode`, so callers fall back to trying each
    policy until the broker accepts one (see `send_with_fill`).
    """
    mode = getattr(info, "trade_fill_mode", 0) or 0
    if mode & 1:
        return mt5.ORDER_FILLING_FOK
    if mode & 2:
        return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN


def send_with_fill(request: dict, fill: int):
    """Send, retrying other filling policies only when the broker rejects one.

    10030 is TRADE_RETCODE_INVALID_FILL; any other rejection is a real
    business error (no funds, market closed, …) and must reach the caller.
    """
    modes = [fill]
    for mode in (mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_RETURN):
        if mode not in modes:
            modes.append(mode)
    result = None
    for mode in modes:
        request["type_filling"] = mode
        result = mt5.order_send(request)
        if result is None:
            break
        if result.retcode == mt5.TRADE_RETCODE_DONE or result.retcode != 10030:
            break
    return result


def positions_for(symbol: str):
    return [p for p in seq(mt5.positions_get()) if p.symbol == symbol]


class Handler(BaseHTTPRequestHandler):
    server_version = "EzyViewBridge/1.0"
    protocol_version = "HTTP/1.1"

    # --- plumbing -------------------------------------------------------
    def log_message(self, fmt, *args):  # quiet by default
        if os.environ.get("EZYVIEW_MT5_VERBOSE"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors_origin(self) -> str:
        origin = (self.headers.get("Origin") or "").strip()
        if origin in ALLOWED_ORIGINS or origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:"):
            return origin
        return "tauri://localhost"

    def _authorized(self) -> bool:
        if not BRIDGE_TOKEN:
            return True
        provided = (self.headers.get("X-Bridge-Token") or "").strip()
        return provided == BRIDGE_TOKEN

    def _send(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", self._cors_origin())
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        # One request per connection: browsers reuse pooled sockets, and a
        # reused socket to this server sometimes dies before any bytes flow.
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        if self.command != "OPTIONS":
            self.wfile.write(body)

    def _fail(self, message, status=500):
        self._send({"error": str(message)}, status)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > 1_048_576:
            return {"_bad_json": "request body too large"}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8")) or {}
        except Exception as err:
            return {"_bad_json": str(err)}

    def do_OPTIONS(self):
        self._send({"ok": True})

    def do_GET(self):
        client_ip = self.client_address[0] if self.client_address else "127.0.0.1"
        if not check_rate_limit(client_ip):
            return self._fail("rate limit exceeded", 429)
        if not self._authorized():
            return self._fail("unauthorized: invalid or missing X-Bridge-Token", 401)
        url = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            # Health and the audit log answer even with no terminal attached.
            if url.path not in ("/health", "/audit") and not ensure_connected():
                return self._fail("MetaTrader 5 terminal is not running", 503)
            if url.path == "/health":
                return self._health()
            if url.path == "/symbols":
                return self._symbols(query.get("q", ""))
            if url.path == "/history":
                return self._history(query)
            if url.path == "/quote":
                return self._quote(query.get("symbol", ""))
            if url.path == "/account":
                return self._account()
            if url.path == "/positions":
                return self._positions()
            if url.path == "/deals":
                return self._deals(query)
            if url.path == "/audit":
                return self._send({"rows": audit_rows(int(query.get("limit", "50")))})
            self._fail("not found: " + url.path, 404)
        except Exception as err:  # never take the server down
            self._fail(err, 500)

    def do_POST(self):
        client_ip = self.client_address[0] if self.client_address else "127.0.0.1"
        if not check_rate_limit(client_ip):
            return self._fail("rate limit exceeded", 429)
        if not self._authorized():
            return self._fail("unauthorized: invalid or missing X-Bridge-Token", 401)
        url = urlparse(self.path)
        body = self._body()
        if "_bad_json" in body:
            return self._fail("invalid JSON body", 400)
        try:
            # /connect opens the terminal; /disconnect works regardless of state.
            if url.path == "/connect":
                return self._connect(body)
            if url.path == "/disconnect":
                return self._disconnect()
            if not ensure_connected():
                return self._fail("MetaTrader 5 terminal is not running", 503)
            # Once /connect has minted a session, trade writes must carry it:
            # nobody trades on a terminal the app did not log into.
            if SESSION is not None and body.get("session") != SESSION:
                return self._fail("stale or missing session — reconnect from EzyView", 401)
            if url.path == "/order":
                return self._order(body)
            if url.path == "/close":
                return self._close(body)
            if url.path == "/cancel":
                return self._cancel(body)
            if url.path == "/modify":
                return self._modify(body)
            self._fail("not found: " + url.path, 404)
        except Exception as err:
            self._fail(err, 500)

    # --- session (Phase 1) ------------------------------------------------
    def _connect(self, body: dict):
        """Log the terminal into an account and mint a one-app session.

        The password lives only in this scope: it is passed straight to
        `mt5.initialize`, scrubbed from any error text, and never written
        anywhere — including the audit log.
        """
        global SESSION, SESSION_ACCOUNT
        server = str(body.get("server") or "").strip()
        login = str(body.get("login") or "").strip()
        password = str(body.get("password") or "")
        if not server or not login.isdigit() or not password:
            audit("connect", login=login or None, server=server or None, result="rejected", error="bad credentials")
            return self._fail("server, a numeric login and a password are required", 400)
        kwargs = {"timeout": 15000, "login": int(login), "password": password, "server": server}
        path = terminal_path()
        if path:
            kwargs["path"] = path
        with LOCK:
            ok = bool(mt5.initialize(**kwargs))
            account = mt5.account_info() if ok else None
            err = redact(mt5.last_error(), password) if not ok else None
        if not ok or account is None:
            audit("connect", login=login, server=server, result="rejected", error=err)
            return self._fail(err or "login failed", 401)
        if str(account.login) != login:
            with LOCK:
                mt5.shutdown()
            audit("connect", login=login, server=server, result="rejected", error="account mismatch")
            return self._fail("terminal ended up on a different account", 409)
        SESSION = uuid.uuid4().hex
        SESSION_ACCOUNT = {"login": login, "server": account.server or server, "demo": account.trade_mode == 0}
        audit("connect", login=login, server=server, result="ok")
        self._send({
            "ok": True,
            "session": SESSION,
            "login": login,
            "server": SESSION_ACCOUNT["server"],
            "demo": SESSION_ACCOUNT["demo"],
            "balance": account.balance,
            "equity": account.equity,
            "margin": account.margin,
            "free_margin": account.margin_free,
            "profit": account.profit,
            "currency": account.currency,
            "leverage": account.leverage,
        })

    def _disconnect(self):
        global SESSION, SESSION_ACCOUNT
        login = SESSION_ACCOUNT.get("login") if SESSION_ACCOUNT else None
        server = SESSION_ACCOUNT.get("server") if SESSION_ACCOUNT else None
        with LOCK:
            mt5.shutdown()
        SESSION = SESSION_ACCOUNT = None
        audit("disconnect", login=login, server=server, result="ok")
        self._send({"ok": True})

    # --- reads ----------------------------------------------------------
    def _health(self):
        # Reattaches here too, so a restarted terminal turns green on its own.
        ensure_connected()
        with LOCK:
            info = mt5.terminal_info()
            account = mt5.account_info()
            connected = bool(info and account)
            payload = {
                "ok": connected,
                "connected": connected,
                "error": _last_error,
                "version": ser(mt5.version()),
            }
            if account:
                payload["login"] = account.login
                payload["server"] = account.server
        payload["app_session"] = SESSION is not None
        if SESSION_ACCOUNT:
            payload["session_login"] = SESSION_ACCOUNT.get("login")
            payload["session_demo"] = SESSION_ACCOUNT.get("demo")
        self._send(payload, 200 if connected else 503)

    def _symbols(self, query: str):
        with LOCK:
            symbols = seq(mt5.symbols_get())
            if query:
                needle = query.upper()
                symbols = [s for s in symbols if needle in _name(s).upper() or needle in (s.description or "").upper()]
            rows = []
            for s in symbols:
                rows.append({
                    "symbol": _name(s),
                    "description": s.description,
                    "path": s.path,
                    "digits": s.digits,
                    "point": s.point,
                    "bid": s.bid,
                    "ask": s.ask,
                    "spread": s.spread,
                    "trade_mode": s.trade_mode,
                    "currency": getattr(s, "currency_base", None) or getattr(s, "currency", None),
                    "visible": s.visible,
                })
        self._send({"symbols": rows})

    def _history(self, query: dict):
        symbol = query.get("symbol", "")
        timeframe = TIMEFRAMES.get(query.get("tf", "M1"), mt5.TIMEFRAME_M1)
        try:
            start = int(float(query.get("from") or 0))
            end = int(float(query.get("to") or 0))
        except ValueError:
            return self._fail("bad from/to", 400)
        with LOCK:
            if not ensure_symbol(symbol):
                return self._fail(f"unknown symbol: {symbol}", 404)
            # A count beyond the broker's stored history returns None outright,
            # so step down until it yields bars.
            rates = None
            for count in (2000, 1000, 300, 100, 30, 10, 1):
                rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
                if rates is not None:
                    break
            rows = [ser(r) for r in seq(rates)]
        if start or end:
            rows = [r for r in rows if (not start or r["time"] >= start) and (not end or r["time"] <= end)]
        rows.sort(key=lambda r: r["time"])
        self._send({"rates": rows})

    def _quote(self, symbol: str):
        if not symbol:
            return self._fail("symbol required", 400)
        with LOCK:
            if not ensure_symbol(symbol):
                return self._fail(f"unknown symbol: {symbol}", 404)
            tick = mt5.symbol_info_tick(symbol)
            info = mt5.symbol_info(symbol)
        if tick is None:
            return self._fail("no tick", 404)
        self._send({
            "symbol": symbol,
            "bid": tick.bid,
            "ask": tick.ask,
            "last": getattr(tick, "last", 0) or tick.bid,
            "time": int(tick.time),
            "digits": info.digits if info else 2,
        })

    def _account(self):
        with LOCK:
            account = mt5.account_info()
        if account is None:
            return self._fail("no account", 503)
        self._send(ser(account))

    def _positions(self):
        with LOCK:
            positions = seq(mt5.positions_get())
            orders = seq(mt5.orders_get())
        self._send({"positions": ser(list(positions)), "orders": ser(list(orders))})

    def _deals(self, query: dict):
        try:
            start = int(float(query.get("from") or 0))
            end = int(float(query.get("to") or 0))
        except ValueError:
            return self._fail("bad from/to", 400)
        if not start:
            start = int(datetime.now().timestamp()) - 90 * 86400
        if not end:
            end = int(datetime.now().timestamp()) + 86400
        with LOCK:
            deals = seq(mt5.history_deals_get(datetime.fromtimestamp(start), datetime.fromtimestamp(end)))
        self._send({"deals": ser(list(deals))})

    # --- writes ---------------------------------------------------------
    def _order(self, body: dict):
        symbol = body.get("symbol")
        side = body.get("side", "buy")
        kind = body.get("type", "market")
        try:
            volume = float(body.get("volume") or 0)
        except (TypeError, ValueError):
            volume = 0.0
        if not symbol or not math.isfinite(volume) or volume <= 0:
            return self._fail("symbol and a finite positive volume are required", 400)
        if volume > MAX_ORDER_VOLUME:
            return self._fail(f"volume {volume} exceeds server max limit ({MAX_ORDER_VOLUME})", 400)
        if SYMBOL_ALLOW_LIST and str(symbol).upper() not in SYMBOL_ALLOW_LIST:
            return self._fail(f"symbol {symbol} is not in server allow-list", 403)

        # Read the account ref before taking LOCK: `_account_ref` locks too, and
        # this is a non-reentrant lock.
        login, server = _account_ref()
        with LOCK:
            if not ensure_symbol(symbol):
                return self._fail(f"unknown symbol: {symbol}", 404)
            info = mt5.symbol_info(symbol)
            tick = mt5.symbol_info_tick(symbol)
            if info is None or tick is None:
                return self._fail("no market data for symbol", 409)
            fill = filling_mode(info)
            deviation = int(os.environ.get("EZYVIEW_MT5_DEVIATION", "20"))

            if kind == "market":
                request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": symbol,
                    "volume": volume,
                    "type": mt5.ORDER_TYPE_BUY if side == "buy" else mt5.ORDER_TYPE_SELL,
                    "price": tick.ask if side == "buy" else tick.bid,
                    "deviation": deviation,
                    "magic": 234000,
                    "comment": str(body.get("comment") or "ezyview")[:31],
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": fill,
                }
            else:
                price = body.get("price")
                if price in (None, 0):
                    return self._fail("price required for pending orders", 400)
                request = {
                    "action": mt5.TRADE_ACTION_PENDING,
                    "symbol": symbol,
                    "volume": volume,
                    "price": float(price),
                    "type": mt5.ORDER_TYPE_BUY_LIMIT if (side == "buy") == (kind == "limit") else mt5.ORDER_TYPE_SELL_LIMIT,
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": fill,
                    "magic": 234000,
                    "comment": str(body.get("comment") or "ezyview")[:31],
                }
                if kind == "stop":
                    request["type"] = mt5.ORDER_TYPE_BUY_STOP if side == "buy" else mt5.ORDER_TYPE_SELL_STOP
            if body.get("sl"):
                request["sl"] = float(body["sl"])
            if body.get("tp"):
                request["tp"] = float(body["tp"])

            if body.get("dry_run"):
                # Every check above ran; the terminal is deliberately untouched.
                audit("order", login=login, server=server, symbol=symbol,
                      volume=volume, price=request.get("price"), result="dry_run")
                return self._send({"ok": True, "dry_run": True, "symbol": symbol, "volume": volume})

            result = send_with_fill(request, fill)

        if result is None:
            err = str(mt5.last_error())
            audit("order", login=login, server=server, symbol=symbol, volume=volume,
                  price=request.get("price"), result="error", error=err)
            return self._fail(f"order_send failed: {err}", 502)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            err = f"rejected ({result.retcode}): {result.comment}"
            audit("order", login=login, server=server, symbol=symbol, volume=volume,
                  price=request.get("price"), result="rejected", error=err)
            return self._fail(err, 409)
        audit("order", login=login, server=server, symbol=symbol, volume=volume,
              price=request.get("price"), result=f"done:{result.order}")
        self._send(ser(result._asdict()))

    def _close(self, body: dict):
        symbol = body.get("symbol")
        if not symbol:
            return self._fail("symbol required", 400)
        volume = body.get("volume")
        login, server = _account_ref()
        closed = []
        with LOCK:
            if body.get("dry_run"):
                if not positions_for(symbol):
                    return self._fail(f"no open position on {symbol}", 404)
                audit("close", login=login, server=server, symbol=symbol,
                      volume=float(volume) if volume else None, result="dry_run")
                return self._send({"ok": True, "dry_run": True, "symbol": symbol})
            for pos in positions_for(symbol):
                if volume and pos.volume > float(volume):
                    # Partial close: send the requested part only.
                    part = float(volume)
                    volume = 0
                else:
                    part = pos.volume
                if part <= 0:
                    continue
                tick = mt5.symbol_info_tick(symbol)
                if tick is None:
                    continue
                is_buy = pos.type == mt5.POSITION_TYPE_BUY
                request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": symbol,
                    "volume": part,
                    "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
                    "price": tick.bid if is_buy else tick.ask,
                    "position": pos.ticket,
                    "deviation": int(os.environ.get("EZYVIEW_MT5_DEVIATION", "20")),
                    "magic": 234000,
                    "comment": "ezyview close",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": filling_mode(mt5.symbol_info(symbol)),
                }
                result = send_with_fill(request, filling_mode(mt5.symbol_info(symbol)))
                if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
                    reason = result.comment if result else str(mt5.last_error())
                    audit("close", login=login, server=server, symbol=symbol, volume=part,
                          price=request["price"], result="rejected", error=reason)
                    return self._fail(f"close rejected: {reason}", 409)
                audit("close", login=login, server=server, symbol=symbol, volume=part,
                      price=request["price"], result=f"done:{result.order}")
                closed.append(ser(result._asdict()))
                if volume:
                    continue
                break
        if not closed:
            audit("close", login=login, server=server, symbol=symbol, result="rejected",
                  error="no open position")
            return self._fail(f"no open position on {symbol}", 404)
        self._send({"closed": closed})

    def _cancel(self, body: dict):
        ticket = body.get("ticket")
        if ticket in (None, ""):
            return self._fail("ticket required", 400)
        login, server = _account_ref()
        if body.get("dry_run"):
            audit("cancel", login=login, server=server, result="dry_run", detail=f"ticket {ticket}")
            return self._send({"ok": True, "dry_run": True, "ticket": str(ticket)})
        with LOCK:
            result = mt5.order_send({"action": mt5.TRADE_ACTION_REMOVE, "order": int(ticket)})
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
            reason = result.comment if result else str(mt5.last_error())
            audit("cancel", login=login, server=server, result="rejected", error=reason, detail=f"ticket {ticket}")
            return self._fail(f"delete rejected: {reason}", 409)
        audit("cancel", login=login, server=server, result="done", detail=f"ticket {ticket}")
        self._send(ser(result._asdict()))

    def _modify(self, body: dict):
        ticket = body.get("ticket")
        if ticket in (None, ""):
            return self._fail("ticket required", 400)
        login, server = _account_ref()
        with LOCK:
            position = next((p for p in seq(mt5.positions_get()) if str(p.ticket) == str(ticket)), None)
            if position is None:
                order = next((o for o in seq(mt5.orders_get()) if str(o.ticket) == str(ticket)), None)
                if order is None:
                    return self._fail("unknown ticket", 404)
                request = {
                    "action": mt5.TRADE_ACTION_SLTP,
                    "symbol": order.symbol,
                    "sl": float(body.get("sl") or 0.0),
                    "tp": float(body.get("tp") or 0.0),
                    "order": order.ticket,
                }
            else:
                request = {
                    "action": mt5.TRADE_ACTION_SLTP,
                    "symbol": position.symbol,
                    "position": position.ticket,
                    "sl": float(body.get("sl") or 0.0),
                    "tp": float(body.get("tp") or 0.0),
                }
            detail = f"ticket {ticket} sl {request['sl']} tp {request['tp']}"
            if body.get("dry_run"):
                audit("modify", login=login, server=server, symbol=request["symbol"],
                      result="dry_run", detail=detail)
                return self._send({"ok": True, "dry_run": True, "ticket": str(ticket)})
            result = mt5.order_send(request)
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
            reason = result.comment if result else str(mt5.last_error())
            audit("modify", login=login, server=server, result="rejected", error=reason, detail=detail)
            return self._fail(f"modify rejected: {reason}", 409)
        audit("modify", login=login, server=server, result="done", detail=detail)
        self._send(ser(result._asdict()))


def main() -> int:
    if not connect():
        sys.stderr.write(f"warning: MT5 not attached yet: {_last_error}\n")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"EzyView MT5 bridge listening on http://{HOST}:{PORT} (terminal attached: {_last_error is None})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        with LOCK:
            mt5.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
