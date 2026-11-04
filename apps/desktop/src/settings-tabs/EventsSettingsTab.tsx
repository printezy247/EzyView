import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function EventsSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">Market Events & Breaks</div>
      <div className="space-y-2.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.events.showSessionBreaks}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                events: { ...d.events, showSessionBreaks: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Session breaks (vertical line separating days)</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.events.showEconomicEvents}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                events: { ...d.events, showEconomicEvents: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>Economic events on chart</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.events.showNewsHeadlines}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                events: { ...d.events, showNewsHeadlines: e.target.checked },
              }))
            }
            className="accent-ev-accent"
          />
          <span>News headlines & marks</span>
        </label>
      </div>
    </div>
  );
}
