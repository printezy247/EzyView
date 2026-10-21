import { useWorkspace } from "./store";
import type { EventOptions } from "./eventOptions";

type Key = "earnings" | "economic" | "high" | "medium" | "low";

/** One table drives the bottom bar chips, the Settings checkboxes and the right-click menu. */
export const EVENT_SWITCHES: { key: Key; label: string; description: string }[] = [
  { key: "earnings", label: "Earnings", description: "Show company earnings dates as dots on the chart" },
  { key: "economic", label: "Economic", description: "Show economic-calendar events as markers and vertical lines" },
  { key: "high", label: "High", description: "High-impact events, such as rate decisions and jobs reports" },
  { key: "medium", label: "Medium", description: "Medium-impact events, such as CPI-style data releases" },
  { key: "low", label: "Low", description: "Low-impact events, such as minor speeches and minutes" },
];

export const eventSwitchOn = (o: EventOptions, key: Key): boolean =>
  key === "earnings" ? o.earnings : key === "economic" ? o.economic : o.impacts[key];

/** Impact switches mean nothing while economic events are off. */
export const eventSwitchDisabled = (o: EventOptions, key: Key): boolean =>
  (key === "high" || key === "medium" || key === "low") && !o.economic;

/** Flip one switch in the workspace store. */
export function toggleEventSwitch(o: EventOptions, key: Key): void {
  const set = useWorkspace.getState().setEventOptions;
  if (key === "earnings") set({ earnings: !o.earnings });
  else if (key === "economic") set({ economic: !o.economic });
  else set({ impacts: { [key]: !o.impacts[key] } });
}

/**
 * Event switches. `bar` is the compact chip row under the chart; `panel` is the
 * labelled checkbox list with the description spelled out (Settings).
 */
export function EventsControls({ layout }: { layout: "bar" | "panel" }) {
  const options = useWorkspace((s) => s.eventOptions);

  if (layout === "panel") {
    return (
      <ul className="space-y-1.5" aria-label="Chart events">
        {EVENT_SWITCHES.map(({ key, label, description }) => (
          <li key={key} className={key === "high" || key === "medium" || key === "low" ? "ml-5" : ""}>
            <label className="flex items-start gap-2 text-[12px] text-ev-text">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={eventSwitchOn(options, key)}
                disabled={eventSwitchDisabled(options, key)}
                onChange={() => toggleEventSwitch(options, key)}
              />
              <span>
                <span className="text-ev-strong">{label}</span>
                <span className="block text-[11px] text-ev-muted">{description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div role="group" aria-label="Chart events" className="flex items-center gap-0.5">
      <span className="mr-1 text-[11px] text-ev-faint">Events</span>
      {EVENT_SWITCHES.map(({ key, label, description }) => {
        const on = eventSwitchOn(options, key);
        const disabled = eventSwitchDisabled(options, key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            title={`${description} (${on ? "on" : "off"})`}
            onClick={() => toggleEventSwitch(options, key)}
            className={`rounded px-1.5 py-0.5 text-[11px] disabled:opacity-40 ${
              on ? "bg-ev-accent/15 font-medium text-ev-accent-text" : "text-ev-muted hover:text-ev-strong"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
