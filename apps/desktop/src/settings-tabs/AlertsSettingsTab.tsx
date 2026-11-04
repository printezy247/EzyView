import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Checkbox, ColorInput, Slider } from "../ui";

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
          <Checkbox label="Alert lines on chart" checked={draft.alerts.alertLines} onChange={(checked) =>
                setDraft((d) => ({
                  ...d,
                  alerts: { ...d.alerts, alertLines: checked },
                }))} />
          <ColorInput label="Alert line colour" value={draft.alerts.alertLineColor} onChange={(value) =>
              setDraft((d) => ({
                ...d,
                alerts: { ...d.alerts, alertLineColor: value },
              }))} />
        </div>

        <Checkbox label="Play sound on alert trigger" checked={draft.alerts.playSound} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                alerts: { ...d.alerts, playSound: checked },
              }))} />

        <Slider
          label="Sound volume"
          min={0}
          max={100}
          value={draft.alerts.soundVolume}
          format={(v) => `${v}%`}
          onChange={(soundVolume) =>
            setDraft((d) => ({
              ...d,
              alerts: { ...d.alerts, soundVolume },
            }))
          }
        />
      </div>
    </div>
  );
}
