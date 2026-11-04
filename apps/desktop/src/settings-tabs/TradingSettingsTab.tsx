import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Checkbox, Select } from "../ui";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function TradingSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">General Trading Appearance</div>
      <div className="space-y-2.5">
        <Checkbox label="Positions on chart" checked={draft.trading.showPositions} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, showPositions: checked },
              }))} />

        <Checkbox label="Orders on chart" checked={draft.trading.showOrders} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, showOrders: checked },
              }))} />

        <Checkbox label="Executions (historical fill markers)" checked={draft.trading.showExecutions} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, showExecutions: checked },
              }))} />

        <Checkbox label="Extended price lines for positions & orders" checked={draft.trading.extendedPriceLine} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, extendedPriceLine: checked },
              }))} />

        <Checkbox label="Instant order placement (skip confirmation modal)" checked={draft.trading.instantOrders} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, instantOrders: checked },
              }))} />

        <Checkbox label="Play sound on order execution" checked={draft.trading.soundOnExecution} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                trading: { ...d.trading, soundOnExecution: checked },
              }))} />
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
