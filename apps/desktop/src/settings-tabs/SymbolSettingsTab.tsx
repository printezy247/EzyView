import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Select } from "../ui";

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
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={true}
            readOnly
            className="accent-ev-accent"
          />
          <span>Body</span>
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5" title="Body Up Color">
            <input
              type="color"
              value={draft.symbol.bodyUpColor}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, bodyUpColor: e.target.value },
                }))
              }
              className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
            />
            <span className="text-micro text-ev-muted">Up</span>
          </label>
          <label className="flex items-center gap-1.5" title="Body Down Color">
            <input
              type="color"
              value={draft.symbol.bodyDownColor}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, bodyDownColor: e.target.value },
                }))
              }
              className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
            />
            <span className="text-micro text-ev-muted">Down</span>
          </label>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={true}
            readOnly
            className="accent-ev-accent"
          />
          <span>Borders</span>
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5" title="Border Up Color">
            <input
              type="color"
              value={draft.symbol.borderUpColor}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, borderUpColor: e.target.value },
                }))
              }
              className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
            />
            <span className="text-micro text-ev-muted">Up</span>
          </label>
          <label className="flex items-center gap-1.5" title="Border Down Color">
            <input
              type="color"
              value={draft.symbol.borderDownColor}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, borderDownColor: e.target.value },
                }))
              }
              className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
            />
            <span className="text-micro text-ev-muted">Down</span>
          </label>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={true}
            readOnly
            className="accent-ev-accent"
          />
          <span>Wick</span>
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5" title="Wick Up Color">
            <input
              type="color"
              value={draft.symbol.wickUpColor}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, wickUpColor: e.target.value },
                }))
              }
              className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
            />
            <span className="text-micro text-ev-muted">Up</span>
          </label>
          <label className="flex items-center gap-1.5" title="Wick Down Color">
            <input
              type="color"
              value={draft.symbol.wickDownColor}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  symbol: { ...d.symbol, wickDownColor: e.target.value },
                }))
              }
              className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
            />
            <span className="text-micro text-ev-muted">Down</span>
          </label>
        </div>
      </div>

      <div className="my-3 border-t border-ev-raised" />

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.symbol.colorBarsBasedOnPrevClose}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              symbol: { ...d.symbol, colorBarsBasedOnPrevClose: e.target.checked },
            }))
          }
          className="accent-ev-accent"
        />
        <span>Color bars based on previous close</span>
      </label>

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
