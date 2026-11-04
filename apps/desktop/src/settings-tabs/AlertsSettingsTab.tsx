import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function AlertsSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">Chart Alerts</div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.alerts.alertLines}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  alerts: { ...d.alerts, alertLines: e.target.checked },
                }))
              }
              className="accent-ev-accent"
            />
            <span>Alert lines on chart</span>
          </label>
          <input
            type="color"
            value={draft.alerts.alertLineColor}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                alerts: { ...d.alerts, alertLineColor: e.target.value },
              }))
            }
            className="size-6 cursor-pointer rounded border border-ev-line bg-transparent p-0"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.alerts.playSound}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                alerts: { ...d.alerts, playSound: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Play sound on alert trigger</span>
        </label>

        <div className="flex items-center justify-between">
          <span>Sound volume</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={draft.alerts.soundVolume}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  alerts: { ...d.alerts, soundVolume: Number(e.target.value) },
                }))
              }
              className="w-28 accent-ev-accent"
            />
            <span className="w-8 text-right text-micro text-ev-muted">
              {draft.alerts.soundVolume}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
