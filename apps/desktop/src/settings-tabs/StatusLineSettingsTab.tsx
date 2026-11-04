import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Select } from "../ui";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function StatusLineSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">Instrument</div>
      <div className="space-y-2.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.statusLine.showLogo}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showLogo: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Logo</span>
        </label>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={true}
              readOnly
              className="accent-ev-accent"
            />
            <span>Title</span>
          </label>
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

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.statusLine.showOpenMarketStatus}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showOpenMarketStatus: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Open market status</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.statusLine.showOhlc}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showOhlc: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>OHLC values</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.statusLine.showBarChange}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showBarChange: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Bar change values</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.statusLine.showVolume}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, showVolume: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Volume</span>
        </label>
      </div>

      <div className="my-3 border-t border-ev-raised" />

      <div className="font-semibold text-ev-strong">Indicators</div>
      <div className="space-y-2.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.statusLine.indicatorTitles}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, indicatorTitles: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Titles</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.statusLine.indicatorArguments}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, indicatorArguments: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Arguments / Inputs</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.statusLine.indicatorValues}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, indicatorValues: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Values</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.statusLine.indicatorBackground}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                statusLine: { ...d.statusLine, indicatorBackground: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Background</span>
        </label>
      </div>

      <div className="my-3 border-t border-ev-raised" />

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.statusLine.showBuySellButtons}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              statusLine: { ...d.statusLine, showBuySellButtons: e.target.checked },
            }))
          }
          className="accent-ev-accent"
        />
        <span>Buy / Sell quick buttons</span>
      </label>
    </div>
  );
}
