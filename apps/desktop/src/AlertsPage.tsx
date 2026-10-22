import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { activeChartOf } from "./layout";
import { useWorkspace } from "./store";
import { Button, IconButton, rowClass } from "./ui";

const CONDITION_TEXT: Record<string, string> = {
  crossing: "crossing",
  crossing_up: "crossing up",
  crossing_down: "crossing down",
  greater: "greater than",
  less: "less than",
  moving_up: "moving up",
  moving_down: "moving down",
  channel_exit_up: "exits channel up",
  channel_exit_down: "exits channel down",
};

const FREQ_TEXT: Record<string, string> = {
  once: "once",
  once_per_bar: "once per bar",
  once_per_bar_close: "once per bar close",
};

const STATE_TONE: Record<string, string> = {
  armed: "text-ev-muted",
  triggered: "text-ev-warn",
  disabled: "text-ev-dim",
};

const when = (epoch: number): string =>
  new Date(epoch).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** One alert's rolling close series, newest last, as a sparkline row of values. */
function HistoryRow({ closes }: { closes: number[] }) {
  if (closes.length === 0) return <span className="text-ev-faint">—</span>;
  const recent = closes.slice(-8);
  return <span className="num text-ev-muted">{recent.map((c) => c.toFixed(2)).join(" · ")}</span>;
}

/**
 * Alerts destination: every price alert in one table, with its condition,
 * state and the rolling close series the evaluator keeps per alert. The chart's
 * bell dialog creates alerts for one symbol; this page manages them across the
 * whole workspace.
 */
export function AlertsPage() {
  const navigate = useNavigate();
  const alerts = useWorkspace((s) => s.alerts);
  const alertHistory = useWorkspace((s) => s.alertHistory);
  const removeAlert = useWorkspace((s) => s.removeAlert);
  const layout = useWorkspace((s) => s.activeLayout());
  const state = activeChartOf(layout);
  const updateActive = useWorkspace((s) => s.updateActive);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section aria-label="Alerts" className="flex min-h-0 flex-1 flex-col overflow-y-auto text-base">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-ev-raised px-3">
        <h2 className="text-body font-semibold text-ev-strong">Price alerts</h2>
        <span className="text-dense text-ev-faint">
          {alerts.length} total · {alerts.filter((a) => a.state === "triggered").length} triggered
        </span>
        <span className="ml-auto">
          <Button variant="outline" size="sm" onClick={() => navigate("/chart")}>
            Back to chart
          </Button>
        </span>
      </header>

      <div className="p-3">
        {alerts.length === 0 ? (
          <p className="text-base text-ev-faint">
            No alerts yet. Open the chart and use the bell button to arm one on {state.symbol}.
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ev-line text-micro font-semibold uppercase tracking-wider text-ev-faint">
                <th scope="col" className="py-1">Symbol</th>
                <th scope="col" className="py-1">Condition</th>
                <th scope="col" className="py-1">Level</th>
                <th scope="col" className="py-1">Freq</th>
                <th scope="col" className="py-1">State</th>
                <th scope="col" className="py-1">Message</th>
                <th scope="col" className="py-1">Created</th>
                <th scope="col" className="py-1 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <FragmentRow
                  key={a.id}
                  alert={a}
                  closes={alertHistory[a.id] ?? []}
                  expanded={expanded === a.id}
                  onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                  onOpenSymbol={() => {
                    updateActive({ symbol: a.symbol });
                    navigate("/chart");
                  }}
                  onDelete={() => removeAlert(a.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

interface RowProps {
  alert: import("@ezyview/data-adapters").PriceAlert;
  closes: number[];
  expanded: boolean;
  onToggle: () => void;
  onOpenSymbol: () => void;
  onDelete: () => void;
}

function FragmentRow({ alert: a, closes, expanded, onToggle, onOpenSymbol, onDelete }: RowProps) {
  return (
    <>
      <tr
        className={rowClass({ className: "cursor-pointer border-b border-ev-panel hover:bg-ev-raised" })}
        onClick={onToggle}
        onKeyDown={(e) => {
          // The row expands the close history, so it answers the keyboard.
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        title={expanded ? "Hide close history" : "Show close history"}
      >
        <td>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSymbol();
            }}
            className="font-medium text-ev-accent-text hover:underline"
            title={`Open ${a.symbol} on the chart`}
          >
            {a.symbol}
          </button>
        </td>
        <td className="text-ev-muted">{CONDITION_TEXT[a.condition.kind] ?? a.condition.kind}</td>
        <td className="num text-ev-text">{"value" in a.condition ? a.condition.value : "—"}</td>
        <td className="text-ev-muted">{FREQ_TEXT[a.frequency] ?? a.frequency}</td>
        <td className={STATE_TONE[a.state] ?? "text-ev-muted"}>{a.state}</td>
        <td className="truncate text-ev-muted">{a.message || "—"}</td>
        <td className="num text-ev-faint">{when(a.createdAt)}</td>
        <td className="text-right">
          <IconButton
            label={`Delete alert on ${a.symbol}`}
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-ev-down"
          >
            <Trash2 size={13} aria-hidden />
          </IconButton>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-ev-panel bg-ev-panel">
          <td colSpan={8} className="px-2 py-1 text-dense">
            <span className="mr-2 text-ev-faint">Recent closes:</span>
            <HistoryRow closes={closes} />
            {a.triggeredAt !== undefined && (
              <span className="ml-3 text-ev-warn">triggered {when(a.triggeredAt)}</span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
