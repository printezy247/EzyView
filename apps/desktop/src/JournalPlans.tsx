import { useState } from "react";
import { planRewardRisk } from "@ezyview/journal";
import type { TradePlanStatus } from "@ezyview/journal";
import { useJournal } from "./journal";
import { precisionForSymbol } from "./pricePrecision";
import { inputClass } from "./ui";

const field = inputClass("w-full");
const STATUSES: readonly TradePlanStatus[] = ["planned", "executed", "missed", "cancelled"];

const STATUS_LABEL: Record<TradePlanStatus, string> = {
  planned: "Planned",
  executed: "Executed",
  missed: "Missed",
  cancelled: "Cancelled",
};

/** Blank is "not set", not zero: a zero stop would be a real price. */
const num = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Pre-trade plans: the thesis, levels and R:R recorded before the entry.
 *
 * Keeping this beside the journal is the point — a trade can be compared with
 * the plan it came from, and a plan that was never taken still counts.
 */
export function JournalPlans() {
  const plans = useJournal((s) => s.plans);
  const addPlan = useJournal((s) => s.addPlan);
  const updatePlan = useJournal((s) => s.updatePlan);
  const removePlan = useJournal((s) => s.removePlan);

  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [thesis, setThesis] = useState("");

  const submit = () => {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) return;
    addPlan({
      symbol: ticker,
      side,
      ...(num(entry) !== undefined ? { entry: num(entry) } : {}),
      ...(num(stop) !== undefined ? { stop: num(stop) } : {}),
      ...(num(target) !== undefined ? { target: num(target) } : {}),
      ...(thesis.trim() ? { thesis: thesis.trim() } : {}),
    });
    setSymbol("");
    setEntry("");
    setStop("");
    setTarget("");
    setThesis("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-[9rem_7rem_repeat(3,7rem)_minmax(8rem,1fr)_5rem] items-end gap-2 border-b border-ev-raised px-3 py-2">
        <label className="text-dense text-ev-muted">
          Symbol
          <input className={field} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="EURUSD" aria-label="Plan symbol" />
        </label>
        <label className="text-dense text-ev-muted">
          Side
          <select className={field} value={side} onChange={(e) => setSide(e.target.value === "short" ? "short" : "long")} aria-label="Plan side">
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <label className="text-dense text-ev-muted">
          Entry
          <input className={field} value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" aria-label="Plan entry" />
        </label>
        <label className="text-dense text-ev-muted">
          Stop
          <input className={field} value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" aria-label="Plan stop" />
        </label>
        <label className="text-dense text-ev-muted">
          Target
          <input className={field} value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" aria-label="Plan target" />
        </label>
        <label className="text-dense text-ev-muted">
          Thesis
          <input className={field} value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="Why this trade?" aria-label="Plan thesis" />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!symbol.trim()}
          className="h-7 rounded bg-ev-accent px-3 text-dense font-medium text-white hover:bg-ev-accent-hover disabled:opacity-40"
        >
          Add plan
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {plans.length === 0 ? (
          <p className="px-4 py-6 text-base text-ev-faint">
            No plans yet. Record the thesis and levels before the entry; a missed plan still counts.
          </p>
        ) : (
          <ul>
            {plans.map((plan) => {
              const rr = planRewardRisk(plan);
              const digits = precisionForSymbol(plan.symbol, plan.entry ?? null);
              return (
                <li key={plan.id} className="flex items-start gap-3 border-b border-ev-panel px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-ev-strong">{plan.symbol}</span>
                      <span className={plan.side === "long" ? "text-dense text-ev-up-text" : "text-dense text-ev-down-text"}>
                        {plan.side === "long" ? "Long" : "Short"}
                      </span>
                      {rr && (
                        <span className="num rounded bg-ev-raised px-1 text-dense text-ev-muted" title={`Risk ${rr.risk.toFixed(digits)} / reward ${rr.reward.toFixed(digits)}`}>
                          {rr.ratio.toFixed(2)}R
                        </span>
                      )}
                      <span className="text-micro text-ev-faint">
                        {new Date(plan.createdAt * 1000).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="num mt-0.5 flex flex-wrap gap-3 text-dense text-ev-muted">
                      <span>Entry {plan.entry === undefined ? "—" : plan.entry.toFixed(digits)}</span>
                      <span>Stop {plan.stop === undefined ? "—" : plan.stop.toFixed(digits)}</span>
                      <span>Target {plan.target === undefined ? "—" : plan.target.toFixed(digits)}</span>
                    </div>
                    {plan.thesis && <p className="mt-1 text-base text-ev-muted">{plan.thesis}</p>}
                  </div>
                  <select
                    className="rounded border border-ev-line bg-ev-panel px-1 py-0.5 text-dense text-ev-muted"
                    value={plan.status}
                    aria-label={`Plan status for ${plan.symbol}`}
                    onChange={(e) => updatePlan(plan.id, { status: e.target.value as TradePlanStatus })}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removePlan(plan.id)}
                    className="rounded px-1 text-dense text-ev-muted hover:bg-ev-raised hover:text-ev-down-text"
                    aria-label={`Delete plan for ${plan.symbol}`}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
