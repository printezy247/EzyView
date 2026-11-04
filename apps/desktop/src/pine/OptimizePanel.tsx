import { useState } from "react";
import { DEFAULT_MAX_COMBOS } from "@ezyview/pine-transpiler";
import type { OptimizationResult, ParamSpec } from "@ezyview/pine-transpiler";
import { optimizePineWithBudget } from "../pineRunner";
import { parseParamValues } from "../pineOptimize";
import { Button, Input } from "../ui";

/** One-line hint under the Run grid button: cap, failure count, first error. */
function gridHint(next: OptimizationResult, specs: ParamSpec[]): string | null {
  const expected = Math.min(
    specs.reduce((n, s) => n * s.values.length, 1),
    DEFAULT_MAX_COMBOS,
  );
  const notes: string[] = [];
  if (next.capped) notes.push(`capped at ${DEFAULT_MAX_COMBOS}`);
  const failed = expected - next.runs.length;
  if (failed > 0) notes.push(`${failed} combo${failed === 1 ? "" : "s"} failed`);
  // A wholly-failing grid would otherwise report only the count; surface
  // the first thrown message so the script's breakage is visible.
  if (next.firstFailure) notes.push(next.firstFailure);
  return notes.length > 0 ? notes.join(" · ") : null;
}

export function OptimizePanel({
  source,
  bars,
  baseInputs,
  appliedBest,
  onApplyBest,
}: {
  source: string;
  bars: { open: number; high: number; low: number; close: number; volume: number }[];
  baseInputs: Record<string, number>;
  appliedBest: Record<string, number> | null;
  onApplyBest: (inputs: Record<string, number>) => void;
}) {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<OptimizationResult | null>(null);
  const [runHint, setRunHint] = useState<string | null>(null);

  const keys = Object.keys(baseInputs);
  // The optimizer runs in the worker too; the grid can be hundreds of combos
  // so this can take real seconds (budget-bounded, cancellable by the app).
  const [gridBusy, setGridBusy] = useState(false);


  // Parsed on render so the Run button's disabled state matches what a click
  // would actually execute; invalid rows are flagged live, empty ones skipped.
  const specs: ParamSpec[] = [];
  const invalidKeys: string[] = [];
  for (const key of keys) {
    const values = parseParamValues(texts[key] ?? "");
    if (values === null) invalidKeys.push(key);
    else if (values.length > 0) specs.push({ key, values });
  }
  const canRun = specs.length > 0 && bars.length > 0;

  const handleOptimize = (): void => {
    if (gridBusy) return;
    setGridBusy(true);
    const finish = (): void => setGridBusy(false);
    void optimizePineWithBudget(
      source,
      {
        open: bars.map((b) => b.open),
        high: bars.map((b) => b.high),
        low: bars.map((b) => b.low),
        close: bars.map((b) => b.close),
        volume: bars.map((b) => b.volume),
      },
      baseInputs,
      specs,
    )
      .then((next) => {
        setOutcome(next);
        setRunHint(gridHint(next, specs));
        finish();
      })
      .catch((e) => {
        setRunHint(e instanceof Error ? e.message : String(e));
        finish();
      });
  };

  return (
    <div className="border-t border-ev-raised px-4 py-2 text-base">
      <div className="mb-1.5 flex items-center gap-3 text-ev-muted">
        <span className="font-semibold uppercase tracking-wider text-ev-faint">Optimize</span>
        <Button size="sm" variant="outline" onClick={handleOptimize} disabled={!canRun || gridBusy}>
          Run grid
        </Button>
        {appliedBest && (
          <span className="text-ev-muted">
            Next run uses: {Object.entries(appliedBest).map(([k, v]) => `${k}=${v}`).join(" ")}
          </span>
        )}
      </div>

      {keys.map((key) => (
        <div key={key} className="mb-1 flex items-center gap-2">
          <label htmlFor={`opt-values-${key}`} className="w-24 shrink-0 text-ev-faint">
            {key}
          </label>
          <Input
            id={`opt-values-${key}`}
            value={texts[key] ?? ""}
            onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))}
            placeholder="10..50 step 10 or 1,2,3"
            className="w-56"
          />
          <span className="text-ev-faint">now {baseInputs[key]}</span>
        </div>
      ))}

      {bars.length === 0 && <div className="mb-1 text-ev-muted">No data loaded for this symbol yet.</div>}
      {invalidKeys.length > 0 && (
        <div className="mb-1 text-ev-muted">Ignored invalid rows: {invalidKeys.join(", ")}</div>
      )}
      {!canRun && bars.length > 0 && specs.length === 0 && (
        <div className="mb-1 text-ev-muted">Enter values for at least one input, e.g. 10..50 step 10.</div>
      )}

      {outcome && runHint && <div className="mb-1 text-ev-muted">{runHint}</div>}
      {outcome && outcome.runs.length === 0 && (
        <div className="mb-1 text-ev-muted">No successful runs{outcome.capped ? " (grid capped)" : ""}.</div>
      )}
      {outcome && outcome.best && (
        <>
          <div className="mb-1 flex items-center gap-3 text-ev-muted">
            <span>
              {outcome.runs.length} run{outcome.runs.length === 1 ? "" : "s"}
            </span>
            <Button size="sm" variant="outline" onClick={() => onApplyBest(outcome.best!.inputs)}>
              Apply best
            </Button>
          </div>
          <table className="w-full text-left num">
            <thead>
              <tr className="text-dense uppercase tracking-wider text-ev-faint">
                <th scope="col" className="py-0.5 font-semibold">Params</th>
                <th scope="col" className="py-0.5 font-semibold">Net PnL</th>
                <th scope="col" className="py-0.5 font-semibold">Win rate</th>
                <th scope="col" className="py-0.5 font-semibold">PF</th>
              </tr>
            </thead>
            <tbody className="text-ev-muted">
              {/* Runs arrive best-first; the first row is the highlighted best. */}
              {outcome.runs.slice(0, 10).map((r, i) => (
                <tr key={i} className={`border-t border-ev-raised ${i === 0 ? "bg-ev-line/40" : ""}`}>
                  <td className="py-0.5">{Object.entries(r.inputs).map(([k, v]) => `${k}=${v}`).join(" ")}</td>
                  <td className={`py-0.5 ${r.result.totalPnl >= 0 ? "text-ev-up-text" : "text-ev-down-text"}`}>
                    {r.result.totalPnl.toFixed(2)}
                  </td>
                  <td className="py-0.5">{(r.result.winRate * 100).toFixed(1)}%</td>
                  <td className="py-0.5">
                    {r.result.profitFactor === null ? "∞" : r.result.profitFactor.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

