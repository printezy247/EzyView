import type { BacktestResult } from "@ezyview/pine-transpiler";
import type { BacktestParams } from "../PineEditor";
import { EquityCurve, Metric } from "./EquityCurve";
import { Button, Checkbox, NumberInput } from "../ui";

/** Backtest readout: equity curve, headline metrics, the input snapshot, assumptions and recent fills. */
export function StrategyTester({
  result,
  inputs,
  costs,
  onCostsChange,
}: {
  result: BacktestResult;
  inputs?: Record<string, number | string | boolean>;
  costs: BacktestParams;
  onCostsChange: (patch: Partial<BacktestParams>) => void;
}) {
  const recent = [...result.trades].reverse().slice(0, 5);
  const inputEntries = Object.entries(inputs ?? {});
  return (
    <div className="border-t border-ev-raised px-4 py-2 text-base">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="flex-1">
          <EquityCurve equity={result.equity} />
        </div>
        <div className="flex flex-col gap-1 rounded border border-ev-line/60 bg-ev-panel/50 p-2 text-xs text-ev-muted min-w-[200px]">
          <span className="font-semibold uppercase tracking-wider text-ev-faint">Assumptions</span>
          <span className="num">Cash: ${costs.initialCash.toLocaleString()}</span>
          <span className="num">
            Comm: {costs.commission} {costs.commissionType === "percent" ? "%" : "$"}
          </span>
          <span className="num">Slippage: {costs.slippage}</span>
          <span className="num">Multiplier: {costs.multiplier}x</span>
          <span>{costs.fillOnNextOpen ? "Next Open" : "Close"}</span>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <NumberInput
          inline
          label="Initial Cash:"
          value={costs.initialCash}
          onValueChange={(v) => onCostsChange({ initialCash: v ?? 0 })}
          className="w-20"
        />
        <NumberInput
          inline
          label="Commission:"
          step={0.1}
          value={costs.commission}
          onValueChange={(v) => onCostsChange({ commission: v ?? 0 })}
          className="w-16"
        />
        <Button
          size="sm"
          variant="ghost"
          title="Toggle commission units"
          aria-pressed={costs.commissionType === "percent"}
          onClick={() => onCostsChange({ commissionType: costs.commissionType === "cash" ? "percent" : "cash" })}
        >
          {costs.commissionType === "cash" ? "$" : "%"}
        </Button>
        <NumberInput
          inline
          label="Slippage:"
          step={0.1}
          value={costs.slippage}
          onValueChange={(v) => onCostsChange({ slippage: v ?? 0 })}
          className="w-16"
        />
        <NumberInput
          inline
          label="Multiplier:"
          value={costs.multiplier}
          onValueChange={(v) => onCostsChange({ multiplier: v ?? 1 })}
          className="w-16"
        />
        <Checkbox
          label="Fill on next open"
          checked={costs.fillOnNextOpen}
          onChange={(fillOnNextOpen) => onCostsChange({ fillOnNextOpen })}
        />
      </div>
      <div className="mb-1.5 flex items-center gap-4 text-ev-muted">
        <span className="font-semibold uppercase tracking-wider text-ev-faint">Strategy Tester</span>
        <Metric label="Trades" value={String(result.trades.length)} />
        <Metric
          label="Net PnL"
          value={result.totalPnl.toFixed(2)}
          tone={result.totalPnl >= 0 ? "pos" : "neg"}
        />
        <Metric label="Win rate" value={`${(result.winRate * 100).toFixed(1)}%`} />
        <Metric
          label="Profit factor"
          value={result.profitFactor === null ? "∞" : result.profitFactor.toFixed(2)}
        />
        <Metric label="Max DD" value={`${(result.maxDrawdown * 100).toFixed(2)}%`} tone="neg" />
        {result.sharpeRatio !== null && (
          <Metric label="Sharpe" value={result.sharpeRatio.toFixed(2)} />
        )}
        {result.sortinoRatio !== null && (
          <Metric label="Sortino" value={result.sortinoRatio.toFixed(2)} />
        )}
        {result.sqn !== null && (
          <Metric label="SQN" value={result.sqn.toFixed(2)} />
        )}
        <Metric label="Final equity" value={result.finalEquity.toFixed(2)} />
      </div>
      {inputEntries.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-ev-faint">Inputs</span>
          {inputEntries.map(([key, value]) => (
            <span key={key} className="rounded bg-ev-line px-1.5 py-0.5 text-ev-muted">
              {key}={String(value)}
            </span>
          ))}
        </div>
      )}
      <table className="w-full text-left num">
        <thead>
          <tr className="text-dense uppercase tracking-wider text-ev-faint">
            <th scope="col" className="py-0.5 font-semibold">Side</th>
            <th scope="col" className="py-0.5 font-semibold">Entry</th>
            <th scope="col" className="py-0.5 font-semibold">Exit</th>
            <th scope="col" className="py-0.5 font-semibold">PnL</th>
            <th scope="col" className="py-0.5 font-semibold">Return</th>
          </tr>
        </thead>
        <tbody className="text-ev-muted">
          {recent.map((t, i) => (
            <tr key={`${t.entryBar}-${t.exitBar}-${i}`} className="border-t border-ev-raised">
              <td className="py-0.5 capitalize">{t.side}</td>
              <td className="py-0.5">
                #{t.entryBar} @ {t.entryPrice.toFixed(2)}
              </td>
              <td className="py-0.5">
                #{t.exitBar} @ {t.exitPrice.toFixed(2)}
              </td>
              <td className={`py-0.5 ${t.pnl >= 0 ? "text-ev-up-text" : "text-ev-down-text"}`}>{t.pnl.toFixed(2)}</td>
              <td className={`py-0.5 ${t.returnPct >= 0 ? "text-ev-up-text" : "text-ev-down-text"}`}>
                {(t.returnPct * 100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

