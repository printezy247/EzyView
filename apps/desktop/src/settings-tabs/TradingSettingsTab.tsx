import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Select } from "../ui";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function TradingSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">General Trading Appearance</div>
      <div className="space-y-2.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.trading.showPositions}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, showPositions: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Positions on chart</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.trading.showOrders}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, showOrders: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Orders on chart</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.trading.showExecutions}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, showExecutions: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Executions (historical fill markers)</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.trading.extendedPriceLine}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, extendedPriceLine: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Extended price lines for positions & orders</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.trading.instantOrders}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, instantOrders: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Instant order placement (skip confirmation modal)</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.trading.soundOnExecution}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, soundOnExecution: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Play sound on order execution</span>
        </label>
      </div>

      <div className="my-3 border-t border-ev-raised" />

      <div className="flex items-center justify-between">
        <span>Profit & Loss display</span>
        <Select
          label="Profit & Loss display"
          size="sm"
          value={draft.trading.pnlDisplay}
          onChange={(v) =>
            setDraft((d) => ({
              ...d,
              trading: {
                ...d.trading,
                pnlDisplay: v as "money" | "percent" | "ticks",
              },
            }))
          }
          options={[
            { value: "money", label: "Money (USD)" },
            { value: "percent", label: "Percentage (%)" },
            { value: "ticks", label: "Ticks / Pips" },
          ]}
        />
      </div>
    </div>
  );
}
