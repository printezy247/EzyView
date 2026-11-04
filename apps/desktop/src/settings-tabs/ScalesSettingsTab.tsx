import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings, PriceScaleModeName } from "../layout";
import { Select } from "../ui";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function ScalesSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">Price Scale Labels</div>
      <div className="space-y-2.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.scales.symbolNameLabel}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, symbolNameLabel: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Symbol name label</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.scales.symbolLastPriceLabel}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, symbolLastPriceLabel: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Symbol last value label</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.scales.highLowPriceLabels}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, highLowPriceLabels: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>High and low price labels</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.scales.averageClosePriceLabel}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, averageClosePriceLabel: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Average close price label</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.scales.countdownToBarClose}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, countdownToBarClose: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Countdown to bar close</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.scales.plusButton}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, plusButton: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Plus button on price axis</span>
        </label>
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

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.scales.invertScale}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, invertScale: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Invert scale</span>
        </label>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.scales.scalesLines}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  scales: { ...d.scales, scalesLines: e.target.checked },
                }))
              }
              className="accent-ev-accent"
            />
            <span>Scales border lines</span>
          </label>
          <input
            type="color"
            value={draft.scales.scalesLinesColor}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                scales: { ...d.scales, scalesLinesColor: e.target.value },
              }))
            }
            className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
          />
        </div>
      </div>
    </div>
  );
}
