import type { Dispatch, SetStateAction } from "react";
import type { ChartSettings } from "../layout";
import { Checkbox } from "../ui";

interface Props {
  draft: ChartSettings;
  setDraft: Dispatch<SetStateAction<ChartSettings>>;
}

export function EventsSettingsTab({ draft, setDraft }: Props) {
  return (
    <div className="space-y-4">
      <div className="font-semibold text-ev-strong">Market Events & Breaks</div>
      <div className="space-y-2.5">
        <Checkbox label="Session breaks (vertical line separating days)" checked={draft.events.showSessionBreaks} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                events: { ...d.events, showSessionBreaks: checked },
              }))} />

        <Checkbox label="Economic events on chart" checked={draft.events.showEconomicEvents} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                events: { ...d.events, showEconomicEvents: checked },
              }))} />

        <Checkbox label="News headlines & marks" checked={draft.events.showNewsHeadlines} onChange={(checked) =>
              setDraft((d) => ({
                ...d,
                events: { ...d.events, showNewsHeadlines: checked },
              }))} />
      </div>
    </div>
  );
}
