import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { breakevens, buildChain, expiryPnl } from "@ezyview/options";
import type { ChainRow, Leg } from "@ezyview/options";
import { loadHistory, tickerOf } from "./data";
import { Select } from "./ui";

interface Props {
  symbol: string;
  onClose: () => void;
}

const EXPIRIES = [7, 14, 30, 60, 90];

type View = "chain" | "smile" | "payoff";

const STRATEGIES: Record<string, (atm: ChainRow, wing: ChainRow) => Leg[]> = {
  "Long call": (atm) => [{ right: "call", strike: atm.strike, qty: 1, premium: atm.call.mid }],
  "Long put": (atm) => [{ right: "put", strike: atm.strike, qty: 1, premium: atm.put.mid }],
  "Long straddle": (atm) => [
    { right: "call", strike: atm.strike, qty: 1, premium: atm.call.mid },
    { right: "put", strike: atm.strike, qty: 1, premium: atm.put.mid },
  ],
  "Bull call spread": (atm, wing) => [
    { right: "call", strike: atm.strike, qty: 1, premium: atm.call.mid },
    { right: "call", strike: wing.strike, qty: -1, premium: wing.call.mid },
  ],
};

const f = (v: number, d = 2): string => v.toFixed(d);

/**
 * Options chain, volatility smile and strategy payoff.
 *
 * No options feed is wired in, so prices are Black-Scholes values off a model
 * smile around the underlying's last close. The numbers are for studying
 * structure and greeks, not for quoting.
 */
export function OptionsPanel({ symbol, onClose }: Props) {
  const [spot, setSpot] = useState<number | null>(null);
  const [days, setDays] = useState(30);
  const [baseVol, setBaseVol] = useState(0.3);
  const [view, setView] = useState<View>("chain");
  const [strategy, setStrategy] = useState("Long straddle");

  useEffect(() => {
    let cancelled = false;
    setSpot(null);
    void loadHistory(symbol, "1D")
      .then((bars) => {
        if (!cancelled) setSpot(bars[bars.length - 1]?.close ?? null);
      })
      .catch(() => {
        if (!cancelled) setSpot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const expiry = useMemo(() => (spot === null ? null : buildChain({ spot, baseVol, expiries: [days] })[0]!), [spot, baseVol, days]);

  return (
    <section aria-label="Options" className="flex min-h-0 flex-1 flex-col border-t border-ev-raised bg-ev-bg text-dense">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-ev-raised px-3">
        <span className="font-medium text-ev-strong">
          {tickerOf(symbol)} options{spot !== null && <span className="ml-1 font-normal text-ev-muted">spot {f(spot)}</span>}
        </span>
        <div role="tablist" aria-label="Options view" className="ml-2 flex gap-1">
          {(["chain", "smile", "payoff"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={view === v ? "rounded bg-ev-raised px-2 py-1 font-medium capitalize text-ev-strong" : "rounded px-2 py-1 capitalize text-ev-muted hover:text-ev-strong"}
            >
              {v}
            </button>
          ))}
        </div>
        <Select
          id="expiry"
          label="Expiry"
          className="ml-2"
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={EXPIRIES.map((d) => ({ value: String(d), label: `${d}d` }))}
        />
        <label htmlFor="basevol" className="text-ev-muted">
          ATM vol
        </label>
        <input id="basevol" type="range" min={0.1} max={1.2} step={0.05} value={baseVol} onChange={(e) => setBaseVol(Number(e.target.value))} />
        <span className="w-8">{Math.round(baseVol * 100)}%</span>
        <span className="text-ev-muted">Model prices — no live options feed</span>
        <button type="button" onClick={onClose} aria-label="Close options" className="ml-auto rounded p-1 text-ev-muted hover:bg-ev-raised hover:text-ev-strong">
          <X size={13} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {expiry === null ? (
          <p className="p-3 text-ev-muted">Loading…</p>
        ) : view === "chain" ? (
          <Chain rows={expiry.rows} spot={spot!} />
        ) : view === "smile" ? (
          <Smile rows={expiry.rows} spot={spot!} />
        ) : (
          <Payoff rows={expiry.rows} spot={spot!} strategy={strategy} onStrategy={setStrategy} />
        )}
      </div>
    </section>
  );
}

function Chain({ rows, spot }: { rows: ChainRow[]; spot: number }) {
  return (
    <table className="w-full text-right">
      <thead className="sticky top-0 bg-ev-bg text-ev-muted">
        <tr>
          <th scope="col" className="px-2 py-1 font-normal">Δ</th>
          <th scope="col" className="font-normal">IV</th>
          <th scope="col" className="font-normal">Bid</th>
          <th scope="col" className="font-normal">Ask</th>
          <th scope="col" className="bg-ev-panel px-3 font-medium text-ev-strong">Strike</th>
          <th scope="col" className="font-normal">Bid</th>
          <th scope="col" className="font-normal">Ask</th>
          <th scope="col" className="font-normal">IV</th>
          <th scope="col" className="font-normal">Δ</th>
          <th scope="col" className="px-2 font-normal">Γ</th>
          <th scope="col" className="font-normal">Θ/day</th>
          <th scope="col" className="pr-3 font-normal">Vega</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const itmCall = r.strike < spot;
          return (
            <tr key={r.strike} className="border-t border-ev-raised">
              <td className={`px-2 py-0.5 ${itmCall ? "bg-ev-up/10" : ""}`}>{f(r.call.delta)}</td>
              <td className={itmCall ? "bg-ev-up/10" : ""}>{f(r.call.iv * 100, 1)}%</td>
              <td className={itmCall ? "bg-ev-up/10" : ""}>{f(r.call.bid)}</td>
              <td className={itmCall ? "bg-ev-up/10" : ""}>{f(r.call.ask)}</td>
              <td className="bg-ev-panel px-3 font-medium text-ev-strong">{r.strike}</td>
              <td className={!itmCall ? "bg-ev-down/10" : ""}>{f(r.put.bid)}</td>
              <td className={!itmCall ? "bg-ev-down/10" : ""}>{f(r.put.ask)}</td>
              <td className={!itmCall ? "bg-ev-down/10" : ""}>{f(r.put.iv * 100, 1)}%</td>
              <td className={!itmCall ? "bg-ev-down/10" : ""}>{f(r.put.delta)}</td>
              <td className="px-2 text-ev-muted">{f(r.call.gamma, 4)}</td>
              <td className="text-ev-muted">{f(r.call.theta, 3)}</td>
              <td className="pr-3 text-ev-muted">{f(r.call.vega, 3)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Minimal line plot: points in data space, auto-fit to the viewBox. */
function Plot({ points, markers, label, zero }: { points: [number, number][]; markers?: number[]; label: string; zero?: boolean }) {
  const W = 600;
  const H = 160;
  const pad = 24;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys, zero ? 0 : Infinity), Math.max(...ys, zero ? 0 : -Infinity)];
  const sx = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={label}>
      {zero && <line x1={pad} x2={W - pad} y1={sy(0)} y2={sy(0)} className="stroke-ev-dim" strokeDasharray="4 3" />}
      <path d={d} fill="none" className="stroke-ev-accent" strokeWidth={2} />
      {markers?.map((m) => (
        <g key={m}>
          <line x1={sx(m)} x2={sx(m)} y1={pad / 2} y2={H - pad} className="stroke-ev-warn" strokeDasharray="3 3" />
          <text x={sx(m)} y={H - 8} textAnchor="middle" className="fill-ev-warn" fontSize={11}>
            {m.toFixed(2)}
          </text>
        </g>
      ))}
      <text x={pad} y={H - 8} className="fill-ev-muted" fontSize={11}>
        {x0.toFixed(2)}
      </text>
      <text x={W - pad} y={H - 8} textAnchor="end" className="fill-ev-muted" fontSize={11}>
        {x1.toFixed(2)}
      </text>
    </svg>
  );
}

function Smile({ rows, spot }: { rows: ChainRow[]; spot: number }) {
  return (
    <div className="h-full p-2">
      <Plot points={rows.map((r) => [r.strike, r.call.iv * 100])} markers={[spot]} label="Implied volatility by strike, percent" />
    </div>
  );
}

function Payoff({ rows, spot, strategy, onStrategy }: { rows: ChainRow[]; spot: number; strategy: string; onStrategy: (s: string) => void }) {
  const mid = Math.floor(rows.length / 2);
  const legs = STRATEGIES[strategy]!(rows[mid]!, rows[Math.min(mid + 2, rows.length - 1)]!);
  const lo = spot * 0.7;
  const hi = spot * 1.3;
  const points: [number, number][] = Array.from({ length: 121 }, (_, i) => {
    const x = lo + ((hi - lo) * i) / 120;
    return [x, expiryPnl(legs, x)];
  });
  const be = breakevens(legs, lo, hi);
  const pnls = points.map((p) => p[1]);
  return (
    <div className="flex h-full gap-3 p-2">
      <div className="min-w-0 flex-1">
        <Plot points={points} markers={be} zero label={`${strategy} profit and loss at expiry`} />
      </div>
      <div className="w-48 shrink-0 space-y-1.5">
        <Select
          label="Strategy"
          className="w-full"
          value={strategy}
          onChange={onStrategy}
          options={Object.keys(STRATEGIES).map((s) => ({ value: s, label: s }))}
        />
        <p className="text-ev-muted">Max profit in range: <span className="text-ev-up-text">{f(Math.max(...pnls))}</span></p>
        <p className="text-ev-muted">Max loss in range: <span className="text-ev-down-text">{f(Math.min(...pnls))}</span></p>
        <p className="text-ev-muted">Break-even: {be.length ? be.map((b) => f(b)).join(" / ") : "none in range"}</p>
        <p className="text-ev-muted">Per 1 unit of underlying, premiums from the model.</p>
      </div>
    </div>
  );
}
