import { useEffect, useState, useSyncExternalStore } from "react";
import { getActiveExportSource, getExportSourceVersion, subscribeExportSources } from "./exportBridge";
import { formatClock, parseGoToDate, RANGE_PRESETS } from "./chartView";
import { EventsControls } from "./EventsControls";
import { useWorkspace } from "./store";
import { buttonClass } from "./ui";

const chip = buttonClass({ size: "sm", variant: "ghost" });
const idle = "text-ev-muted hover:bg-ev-raised hover:text-ev-strong";
const lit = "bg-ev-raised font-medium text-ev-strong";

/**
 * The strip under the chart, as in TradingView: range presets, go-to-date,
 * Events switches, price-scale toggles and a live clock in the chart's
 * timezone. Every control has a hover description. The view controls come from
 * the focused chart cell through the export bridge.
 */
export function ChartBottomBar({ onOpenHotkeys }: { onOpenHotkeys: () => void }) {
  useSyncExternalStore(subscribeExportSources, getExportSourceVersion, getExportSourceVersion);
  // Range and go-to would reveal bars hidden behind a replay cursor, so they wait.
  const replaying = useWorkspace((s) => s.replayBar !== null);
  const view = replaying ? undefined : getActiveExportSource()?.view;
  const priceScale = useWorkspace((s) => s.activeChart().priceScale ?? "normal");
  const timezone = useWorkspace((s) => s.activeChart().timezone);
  const updateActive = useWorkspace((s) => s.updateActive);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      role="toolbar"
      aria-label="Chart range and events"
      className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto border-t border-ev-raised px-2"
    >
      {RANGE_PRESETS.map(({ id, description }) => (
        <button
          key={id}
          type="button"
          disabled={!view}
          title={description}
          onClick={() => void view?.showRange(id)}
          className={`${chip} ${idle}`}
        >
          {id}
        </button>
      ))}

      <input
        type="date"
        aria-label="Go to date"
        title="Jump the chart to a date"
        disabled={!view}
        onChange={(e) => {
          const t = parseGoToDate(e.target.value);
          if (t !== null) void view?.goTo(t);
        }}
        className="ml-1 h-5 rounded border border-ev-line bg-ev-panel px-1 text-dense text-ev-text disabled:opacity-40"
      />

      <div className="mx-2 h-4 w-px shrink-0 bg-ev-raised" />
      <EventsControls layout="bar" />

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <button type="button" disabled={!view} title="Reset zoom, scroll and price scale" onClick={() => view?.reset()} className={`${chip} ${idle}`}>
          Reset
        </button>
        <button type="button" disabled={!view} title="Fit the price scale to the visible bars" onClick={() => view?.autoScale()} className={`${chip} ${idle}`}>
          Auto
        </button>
        <button
          type="button"
          aria-pressed={priceScale === "log"}
          title="Logarithmic price scale"
          onClick={() => updateActive({ priceScale: priceScale === "log" ? "normal" : "log" })}
          className={`${chip} ${priceScale === "log" ? lit : idle}`}
        >
          Log
        </button>
        <button
          type="button"
          aria-pressed={priceScale === "percentage"}
          title="Show price as percent change from the first visible bar"
          onClick={() => updateActive({ priceScale: priceScale === "percentage" ? "normal" : "percentage" })}
          className={`${chip} ${priceScale === "percentage" ? lit : idle}`}
        >
          %
        </button>
        <span className="ml-2 text-dense num text-ev-muted" title="Current time in the chart's timezone">
          {formatClock(now, timezone)}
        </span>
        <button
          type="button"
          onClick={onOpenHotkeys}
          title="Keyboard shortcuts (?)"
          aria-keyshortcuts="?"
          className={`${chip} ${idle} ml-auto`}
        >
          Shortcuts
        </button>
      </div>
    </div>
  );
}
