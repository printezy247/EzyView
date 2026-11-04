import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Checkbox, Select } from "../ui";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function StatusLineSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">Instrument</div>
      <div className="space-y-2.5">
        <Checkbox label="Logo" checked={draft.statusLine.showLogo} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showLogo: checked },
              }))} />

        <div className="flex items-center justify-between">
          <Checkbox label="Title" checked disabled onChange={() => {}} />
          <Select
            label="Title"
            size="sm"
            value={draft.statusLine.titleMode}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                statusLine: {
                  ...d.statusLine,
                  titleMode: v as "both" | "ticker" | "description",
                },
              }))
            }
            options={[
              { value: "both", label: "Ticker and description" },
              { value: "ticker", label: "Ticker only" },
              { value: "description", label: "Description only" },
            ]}
          />
        </div>

        <Checkbox label="Open market status" checked={draft.statusLine.showOpenMarketStatus} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showOpenMarketStatus: checked },
              }))} />

        <Checkbox label="OHLC values" checked={draft.statusLine.showOhlc} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showOhlc: checked },
              }))} />

        <Checkbox label="Bar change values" checked={draft.statusLine.showBarChange} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showBarChange: checked },
              }))} />

        <Checkbox label="Volume" checked={draft.statusLine.showVolume} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showVolume: checked },
              }))} />
      </div>

      <div className="my-3 border-t border-ev-raised" />

      <div className="font-semibold text-ev-strong">Indicators</div>
      <div className="space-y-2.5">
        <Checkbox label="Titles" checked={draft.statusLine.indicatorTitles} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, indicatorTitles: checked },
              }))} />

        <Checkbox label="Arguments / Inputs" checked={draft.statusLine.indicatorArguments} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, indicatorArguments: checked },
              }))} />

        <Checkbox label="Values" checked={draft.statusLine.indicatorValues} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, indicatorValues: checked },
              }))} />

        <Checkbox label="Background" checked={draft.statusLine.indicatorBackground} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, indicatorBackground: checked },
              }))} />
      </div>

      <div className="my-3 border-t border-ev-raised" />

      <Checkbox label="Buy / Sell quick buttons" checked={draft.statusLine.showBuySellButtons} onChange={(checked) =>
            setDraft((d) => ({
              ...d,
              statusLine: { ...d.statusLine, showBuySellButtons: checked },
            }))} />
    </div>
  );
}
