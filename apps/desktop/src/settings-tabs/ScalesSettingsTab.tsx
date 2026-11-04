import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings, PriceScaleModeName } from "../layout";
import { Checkbox, ColorInput, Select } from "../ui";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function ScalesSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">Price Scale Labels</div>
      <div className="space-y-2.5">
        <Checkbox label="Symbol name label" checked={draft.scales.symbolNameLabel} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, symbolNameLabel: checked },
              }))} />

        <Checkbox label="Symbol last value label" checked={draft.scales.symbolLastPriceLabel} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, symbolLastPriceLabel: checked },
              }))} />

        <Checkbox label="High and low price labels" checked={draft.scales.highLowPriceLabels} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, highLowPriceLabels: checked },
              }))} />

        <Checkbox label="Average close price label" checked={draft.scales.averageClosePriceLabel} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, averageClosePriceLabel: checked },
              }))} />

        <Checkbox label="Countdown to bar close" checked={draft.scales.countdownToBarClose} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, countdownToBarClose: checked },
              }))} />

        <Checkbox label="Plus button on price axis" checked={draft.scales.plusButton} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, plusButton: checked },
              }))} />
      </div>

      <div className="my-3 border-t border-ev-raised" />

      <div className="font-semibold text-ev-strong">Scale Modes & Lines</div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span>Price scale mode</span>
          <Select
            label="Price scale mode"
            size="sm"
            value={draft.scales.priceScaleMode}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                scales: {
                  ...d.scales,
                  priceScaleMode: v as PriceScaleModeName,
                },
              }))
            }
            options={[
              { value: "normal", label: "Normal (Linear)" },
              { value: "log", label: "Logarithmic" },
              { value: "percentage", label: "Percentage" },
            ]}
          />
        </div>

        <Checkbox label="Invert scale" checked={draft.scales.invertScale} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, invertScale: checked },
              }))} />

        <div className="flex items-center justify-between">
          <Checkbox label="Scales border lines" checked={draft.scales.scalesLines} onChange={(checked) =>
                setDraft((d) => ({
                  ...d,
                  scales: { ...d.scales, scalesLines: checked },
                }))} />
          <ColorInput label="Scales line colour" value={draft.scales.scalesLinesColor} onChange={(value) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, scalesLinesColor: value },
              }))} />
        </div>
      </div>
    </div>
  );
}
