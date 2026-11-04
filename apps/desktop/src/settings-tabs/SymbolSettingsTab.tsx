import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Checkbox, ColorInput, Select } from "../ui";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

const TIMEZONES = [
      { id: "exchange", label: "Exchange / Local" },
      { id: "UTC", label: "(UTC) Coordinated Universal Time" },
      { id: "America/New_York", label: "(UTC-5) New York / Eastern" },
      { id: "America/Chicago", label: "(UTC-6) Chicago / Central" },
      { id: "America/Los_Angeles", label: "(UTC-8) Los Angeles / Pacific" },
      { id: "Europe/London", label: "(UTC+0) London" },
      { id: "Europe/Berlin", label: "(UTC+1) Frankfurt / Berlin" },
      { id: "Asia/Dubai", label: "(UTC+4) Dubai" },
      { id: "Asia/Singapore", label: "(UTC+8) Singapore / Hong Kong" },
      { id: "Asia/Tokyo", label: "(UTC+9) Tokyo" },
      { id: "Australia/Sydney", label: "(UTC+10) Sydney" },
    ];

export function SymbolSettingsTab({ draft, setDraft }: Props) {
  return (


    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">Candles</div>

      <div className="grid grid-cols-[140px_auto] items-center gap-y-3">
        <Checkbox label="Body" checked disabled onChange={() => {}} />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5" title="Body Up Color">
            <ColorInput label="Body up colour" value={draft.symbol.bodyUpColor} onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, bodyUpColor: value },
                }))} />
            <span className="text-micro text-ev-muted">Up</span>
          </label>
          <label className="flex items-center gap-1.5" title="Body Down Color">
            <ColorInput label="Body down colour" value={draft.symbol.bodyDownColor} onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, bodyDownColor: value },
                }))} />
            <span className="text-micro text-ev-muted">Down</span>
          </label>
        </div>

        <Checkbox label="Borders" checked disabled onChange={() => {}} />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5" title="Border Up Color">
            <ColorInput label="Border up colour" value={draft.symbol.borderUpColor} onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, borderUpColor: value },
                }))} />
            <span className="text-micro text-ev-muted">Up</span>
          </label>
          <label className="flex items-center gap-1.5" title="Border Down Color">
            <ColorInput label="Border down colour" value={draft.symbol.borderDownColor} onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, borderDownColor: value },
                }))} />
            <span className="text-micro text-ev-muted">Down</span>
          </label>
        </div>

        <Checkbox label="Wick" checked disabled onChange={() => {}} />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5" title="Wick Up Color">
            <ColorInput label="Wick up colour" value={draft.symbol.wickUpColor} onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, wickUpColor: value },
                }))} />
            <span className="text-micro text-ev-muted">Up</span>
          </label>
          <label className="flex items-center gap-1.5" title="Wick Down Color">
            <ColorInput label="Wick down colour" value={draft.symbol.wickDownColor} onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, wickDownColor: value },
                }))} />
            <span className="text-micro text-ev-muted">Down</span>
          </label>
        </div>
      </div>

      <div className="my-3 border-t border-ev-raised" />

      <Checkbox label="Color bars based on previous close" checked={draft.symbol.colorBarsBasedOnPrevClose} onChange={(checked) =>
            setDraft((d) => ({
              ...d,
              symbol: { ...d.symbol, colorBarsBasedOnPrevClose: checked },
            }))} />

      <div className="my-3 border-t border-ev-raised" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span>Precision</span>
          <Select
            label="Precision"
            size="sm"
            value={draft.symbol.precision}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                symbol: { ...d.symbol, precision: v },
              }))
            }
            options={[
              { value: "default", label: "Default" },
              { value: "1/10", label: "1/10 (0.1)" },
              { value: "1/100", label: "1/100 (0.01)" },
              { value: "1/1000", label: "1/1000 (0.001)" },
              { value: "1/10000", label: "1/10000 (0.0001)" },
              { value: "1/100000", label: "1/100000 (0.00001)" },
            ]}
          />
        </div>

        <div className="flex items-center justify-between">
          <span>Timezone</span>
          <Select
            label="Timezone"
            size="sm"
            className="max-w-[280px]"
            value={draft.symbol.timezone}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                symbol: { ...d.symbol, timezone: v },
              }))
            }
            options={TIMEZONES.map((tz) => ({ value: tz.id, label: tz.label }))}
          />
        </div>
      </div>
    </div>
  );
}
