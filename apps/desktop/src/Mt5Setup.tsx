import { useEffect, useState } from "react";
import { keyringAvailable } from "./apiKeys";
import { RiskRequiredError, useMt5Accounts } from "./mt5Accounts";
import type { Mt5Settings } from "./mt5";
import { maskLogin } from "./tradingSafety";
import type { TransportKind } from "@ezyview/mt5-adapter";

/**
 * Connection settings for the broker feed.
 *
 * Two transports, one form: the local bridge (works wherever the terminal can
 * be attached, including Wine) and MT5's built-in MCP server (no sidecar, but
 * needs a key MT5 will actually accept). Plus the Phase 1 tabs: broker logins
 * (passwords only ever go to the OS keyring), the safety rails, and the
 * bridge audit log.
 */

const field = "w-full rounded border border-ev-line bg-ev-bg px-2 py-1 text-[11px] text-ev-text focus:border-ev-accent";

function money(value: number | undefined, currency: string | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

export function ConnectionTab({ settings, save, busy, setBusy }: { settings: Mt5Settings; save: (patch: Partial<Mt5Settings>) => Promise<void>; busy: boolean; setBusy: (b: boolean) => void }) {
  const [draft, setDraft] = useState<Mt5Settings>(settings);
  const submit = async () => {
    setBusy(true);
    await save(draft);
    setBusy(false);
  };
  return (
    <>
      <p className="mb-2 text-[11px] text-ev-muted">
        Where MetaTrader 5 answers from. The app only connects to this computer (127.0.0.1 or localhost); reach a
        terminal on another machine through an SSH tunnel.
      </p>
      <div className="mb-2 flex gap-1">
        {(["bridge", "mcp"] as TransportKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={draft.kind === kind}
            onClick={() => setDraft({ ...draft, kind })}
            className={
              draft.kind === kind
                ? "flex-1 rounded bg-ev-raised px-2 py-1 text-[11px] font-medium text-ev-strong"
                : "flex-1 rounded px-2 py-1 text-[11px] text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
            }
          >
            {kind === "bridge" ? "Local bridge" : "Built-in MCP"}
          </button>
        ))}
      </div>
      {draft.kind === "bridge" ? (
        <label className="mb-2 block text-[11px] text-ev-muted">
          Bridge URL
          <input className={field} value={draft.bridgeUrl} onChange={(e) => setDraft({ ...draft, bridgeUrl: e.target.value })} spellCheck={false} />
        </label>
      ) : (
        <>
          <label className="mb-2 block text-[11px] text-ev-muted">
            MCP endpoint
            <input className={field} value={draft.mcpUrl} onChange={(e) => setDraft({ ...draft, mcpUrl: e.target.value })} spellCheck={false} />
          </label>
          <label className="mb-2 block text-[11px] text-ev-muted">
            API key
            <input className={field} type="password" value={draft.mcpKey} onChange={(e) => setDraft({ ...draft, mcpKey: e.target.value })} placeholder="Tools → Options → MCP" spellCheck={false} />
            <span className="mt-0.5 block text-[11px] text-ev-muted">
              {keyringAvailable() ? "Saved in your OS keyring." : "Kept for this session only (desktop app saves it to the keyring)."}
            </span>
          </label>
        </>
      )}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded bg-ev-accent px-3 py-1 text-[11px] font-medium text-white hover:bg-ev-accent-hover disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}

export function BrokerTab() {
  const accounts = useMt5Accounts((s) => s.accounts);
  const session = useMt5Accounts((s) => s.session);
  const busy = useMt5Accounts((s) => s.busy);
  const error = useMt5Accounts((s) => s.error);
  const addAccount = useMt5Accounts((s) => s.addAccount);
  const connect = useMt5Accounts((s) => s.connect);
  const disconnect = useMt5Accounts((s) => s.disconnect);
  const forget = useMt5Accounts((s) => s.forget);

  const [server, setServer] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [riskPending, setRiskPending] = useState(false);
  const [riskOk, setRiskOk] = useState(false);

  const runConnect = async (accepted: boolean) => {
    setRiskOk(false);
    try {
      if (password) {
        await addAccount({ server, login, password }).catch(() => undefined);
      }
      await connect({ server, login, password: password || undefined, riskAccepted: accepted || undefined });
      setPassword("");
      setRiskPending(false);
    } catch (err) {
      if (err instanceof RiskRequiredError) setRiskPending(true);
    }
  };

  if (session) {
    const s = session.summary;
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-ev-muted">
          <span className={`mr-1 rounded px-1 py-0.5 text-[10px] font-semibold ${session.demo ? "bg-ev-raised text-ev-strong" : "bg-ev-warn/20 text-ev-warn"}`}>
            {session.demo ? "DEMO" : "REAL"}
          </span>
          {maskLogin(session.login)} @ {session.server}
        </p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {(
            [
              ["Balance", money(s.balance, s.currency)],
              ["Equity", money(s.equity, s.currency)],
              ["Margin", money(s.margin, s.currency)],
              ["Free margin", money(s.free_margin, s.currency)],
              ["Profit", money(s.profit, s.currency)],
              ["Leverage", s.leverage === undefined ? "—" : `${Math.round(s.leverage)}:1`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <dt className="text-ev-muted">{label}</dt>
              <dd className="font-mono text-ev-text">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => void disconnect()} className="rounded border border-ev-line px-2 py-1 text-[11px] text-ev-muted hover:text-ev-strong">
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {accounts.length > 0 && (
        <ul className="space-y-1">
          {accounts.map((a) => (
            <li key={`${a.server}|${a.login}`} className="flex items-center justify-between gap-2 rounded border border-ev-line px-2 py-1">
              <span className="truncate text-[11px] text-ev-text">
                {a.label || `${maskLogin(a.login)} @ ${a.server}`} <span className="text-ev-muted">{a.demo ? "demo" : "real"}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setServer(a.server);
                    setLogin(a.login);
                    setRiskPending(false);
                  }}
                  className="px-1 text-[11px] text-ev-accent hover:underline"
                >
                  fill
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setServer(a.server);
                    setLogin(a.login);
                    void connect({ server: a.server, login: a.login }).catch((e) => {
                      if (e instanceof RiskRequiredError) setRiskPending(true);
                    });
                  }}
                  className="px-1 text-[11px] text-ev-accent hover:underline"
                >
                  connect
                </button>
                <button type="button" disabled={busy} onClick={() => void forget(a.server, a.login)} className="px-1 text-[11px] text-ev-down hover:underline">
                  forget
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <label className="block text-[11px] text-ev-muted">
        Server
        <input className={field} value={server} onChange={(e) => setServer(e.target.value)} placeholder="MetaQuotes-Demo" spellCheck={false} />
      </label>
      <label className="block text-[11px] text-ev-muted">
        Login
        <input className={field} value={login} onChange={(e) => setLogin(e.target.value)} inputMode="numeric" spellCheck={false} />
      </label>
      <label className="block text-[11px] text-ev-muted">
        Password
        <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={accounts.length ? "leave empty to use the saved one" : ""} spellCheck={false} />
      </label>
      {riskPending && (
        <label className="flex items-start gap-2 rounded border border-ev-warn/40 bg-ev-warn/10 p-2 text-[11px] text-ev-warn">
          <input type="checkbox" checked={riskOk} onChange={(e) => setRiskOk(e.target.checked)} />
          <span>
            This login is a <strong>real-money</strong> account. Orders you confirm in EzyView can open live positions. I understand.
          </span>
        </label>
      )}
      {error && <p className="rounded border border-ev-down/40 bg-ev-down/10 p-1.5 text-[11px] text-ev-down">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy || !server.trim() || !login.trim() || (riskPending && !riskOk)}
          onClick={() => void runConnect(riskPending && riskOk)}
          className="rounded bg-ev-accent px-3 py-1 text-[11px] font-medium text-white hover:bg-ev-accent-hover disabled:opacity-50"
        >
          {busy ? "Connecting…" : riskPending ? "Connect to real account" : "Connect"}
        </button>
      </div>
    </div>
  );
}

export function SafetyTab() {
  const safety = useMt5Accounts((s) => s.safety);
  const saveSafety = useMt5Accounts((s) => s.saveSafety);
  return (
    <div className="space-y-2">
      <label className="block text-[11px] text-ev-muted">
        Max order volume (lots)
        <input
          className={field}
          type="number"
          min={0.01}
          step={0.01}
          value={safety.maxOrderVolume}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) saveSafety({ maxOrderVolume: v });
          }}
        />
      </label>
      <label className="block text-[11px] text-ev-muted">
        Symbol allow-list (comma separated, empty = all)
        <input
          className={field}
          value={safety.symbolAllowList.join(", ")}
          onChange={(e) => saveSafety({ symbolAllowList: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          placeholder="XAUUSD, EURUSD"
          spellCheck={false}
        />
      </label>
      <label className="flex items-center gap-2 text-[11px] text-ev-text">
        <input type="checkbox" checked={safety.dryRun} onChange={(e) => saveSafety({ dryRun: e.target.checked })} />
        Dry-run: validate orders at the bridge, never send
      </label>
      <p className="text-[11px] text-ev-muted">
        Every MT5 action still asks for confirmation; these rails block what should never be sent. The MCP transport cannot dry-run and refuses the flag.
      </p>
    </div>
  );
}

interface AuditRow {
  ts?: string;
  event?: string;
  login?: string | number;
  server?: string;
  symbol?: string;
  volume?: number;
  price?: number;
  result?: string;
  error?: string;
  detail?: string;
}

export function AuditTab() {
  const fetchAudit = useMt5Accounts((s) => s.fetchAudit);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const load = () => void fetchAudit(50).then((r) => setRows(r as AuditRow[]));
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (rows === null) return <p className="text-[11px] text-ev-muted">Loading…</p>;
  if (rows.length === 0)
    return <p className="text-[11px] text-ev-muted">No audit rows yet — the bridge writes one per login, order, close, cancel and modify. Nothing here is ever a password.</p>;
  return (
    <div className="space-y-1">
      <div className="flex justify-end">
        <button type="button" onClick={load} className="px-1 text-[11px] text-ev-accent hover:underline">
          refresh
        </button>
      </div>
      <ul className="space-y-1">
        {rows.slice(0, 30).map((r, i) => (
          <li key={`${r.ts}-${i}`} className="rounded border border-ev-line px-2 py-1 text-[10px] text-ev-muted">
            <span className="text-ev-text">{r.ts?.replace("T", " ").slice(0, 19)}</span> · {r.event}
            {r.symbol ? ` · ${r.symbol}` : ""}
            {r.volume !== undefined && r.volume !== null ? ` ×${r.volume}` : ""}
            {r.result === "rejected" || r.result === "error" ? <span className="text-ev-down"> · {r.result}{r.error ? `: ${r.error}` : ""}</span> : ` · ${r.result}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
