import { useEffect, useState, useSyncExternalStore } from "react";
import { getActiveExportSource, getExportSourceVersion, subscribeExportSources } from "./exportBridge";
import { formatClock, parseGoToDate, RANGE_PRESETS } from "./chartView";
import { EventsControls } from "./EventsControls";
import { CompareDialog } from "./CompareDialog";
import { useWorkspace } from "./store";
import { Button, inputClass } from "./ui";

/** Lit pill shared with the footer dock toggles. */
const litPill = "bg-ev-raised font-medium text-ev-strong";

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
  const [compareOpen, setCompareOpen] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      role="toolbar"
      aria-label="Chart range and events"
      className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto border-t border-ev-raised bg-ev-chrome px-2"
    >
      {RANGE_PRESETS.map(({ id, description }) => (
        <Button key={id} size="sm" variant="ghost" disabled={!view} title={description} onClick={() => void view?.showRange(id)}>
          {id}
        </Button>
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
        className={inputClass("h-5 w-28 px-1 text-dense")}
      />

      <Button size="sm" variant="ghost" onClick={() => setCompareOpen(true)} title="Overlay another symbol on this chart" className="ml-1">
        Compare
      </Button>

      <div className="mx-2 h-4 w-px shrink-0 bg-ev-raised" />
      <EventsControls layout="bar" />

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <Button size="sm" variant="ghost" disabled={!view} title="Reset zoom, scroll and price scale" onClick={() => view?.reset()}>
          Reset
        </Button>
        <Button size="sm" variant="ghost" disabled={!view} title="Fit the price scale to the visible bars" onClick={() => view?.autoScale()}>
          Auto
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={priceScale === "log"}
          title="Logarithmic price scale"
          onClick={() => updateActive({ priceScale: priceScale === "log" ? "normal" : "log" })}
          className={priceScale === "log" ? litPill : undefined}
        >
          Log
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={priceScale === "percentage"}
          title="Show price as percent change from the first visible bar"
          onClick={() => updateActive({ priceScale: priceScale === "percentage" ? "normal" : "percentage" })}
          className={priceScale === "percentage" ? litPill : undefined}
        >
          %
        </Button>
        <span className="ml-2 text-dense num text-ev-muted" title="Current time in the chart's timezone" data-volatile="clock">
          {formatClock(now, timezone)}
        </span>
        <Button size="sm" variant="ghost" onClick={onOpenHotkeys} title="Keyboard shortcuts (?)" aria-keyshortcuts="?" className="ml-auto">
          Shortcuts
        </Button>
      </div>
      <CompareDialog open={compareOpen} onClose={() => setCompareOpen(false)} />
    </div>
  );
}
