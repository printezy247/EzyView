import { useState } from "react";
import { useJournal } from "./journal";
import { dayNetOn, isDailyLossBreached, isDrawdownBreached } from "./journalUi";
import { Button, Input } from "./ui";

const money = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Positive finite number from a limit input; empty/invalid means "no limit". */
const parseLimit = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

/**
 * Prop-firm limits: today's net vs the daily loss cap, and peak-to-now
 * drawdown vs the max-DD cap. Breaches flip the bar red; with no limits set
 * a one-line form captures them.
 */
export function JournalPropFirmBar({ drawdown }: { drawdown: number }) {
  const entries = useJournal((s) => s.entries);
  const propFirm = useJournal((s) => s.propFirm);
  const setPropFirm = useJournal((s) => s.setPropFirm);

  const [dailyInput, setDailyInput] = useState(() =>
    propFirm.dailyLossLimit === undefined ? "" : String(propFirm.dailyLossLimit),
  );
  const [ddInput, setDdInput] = useState(() =>
    propFirm.maxDrawdownLimit === undefined ? "" : String(propFirm.maxDrawdownLimit),
  );
  const [editing, setEditing] = useState(false);

  const hasLimits = propFirm.dailyLossLimit !== undefined || propFirm.maxDrawdownLimit !== undefined;
  const showForm = !hasLimits || editing;

  const todayNet = dayNetOn(entries, Math.floor(Date.now() / 1000));
  const dailyBreached = isDailyLossBreached(todayNet, propFirm.dailyLossLimit);
  const ddBreached = isDrawdownBreached(drawdown, propFirm.maxDrawdownLimit);
  const breached = dailyBreached || ddBreached;

  const apply = () => {
    setPropFirm({
      dailyLossLimit: parseLimit(dailyInput),
      maxDrawdownLimit: parseLimit(ddInput),
    });
    setEditing(false);
  };


  if (showForm) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-ev-raised px-3 py-1 text-dense">
        <span className="text-ev-faint">Set limits…</span>
        <Input
          type="number"
          min="0"
          step="any"
          aria-label="Daily loss limit"
          placeholder="Daily loss limit"
          value={dailyInput}
          onChange={(e) => setDailyInput(e.target.value)}
          className="w-36"
        />
        <Input
          type="number"
          min="0"
          step="any"
          aria-label="Max drawdown limit"
          placeholder="Max drawdown limit"
          value={ddInput}
          onChange={(e) => setDdInput(e.target.value)}
          className="w-36"
        />
        <Button size="sm" variant="solid" onClick={apply}>
          Apply
        </Button>
        {hasLimits && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center gap-4 border-b px-3 py-1 text-dense ${
        breached ? "border-ev-down bg-ev-down/10 text-ev-down-text" : "border-ev-raised text-ev-muted"
      }`}
      role={breached ? "alert" : undefined}
    >
      <span className="font-semibold uppercase tracking-wider">Prop firm</span>
      {propFirm.dailyLossLimit !== undefined && (
        <span className="num">
          Daily <span className={dailyBreached ? "font-semibold" : "text-ev-text"}>{money(todayNet)}</span> / −
          {money(propFirm.dailyLossLimit)}
          {dailyBreached && " · BREACH"}
        </span>
      )}
      {propFirm.maxDrawdownLimit !== undefined && (
        <span className="num">
          Max DD <span className={ddBreached ? "font-semibold" : "text-ev-text"}>{money(drawdown)}</span> /{" "}
          {money(propFirm.maxDrawdownLimit)}
          {ddBreached && " · BREACH"}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setDailyInput(propFirm.dailyLossLimit === undefined ? "" : String(propFirm.dailyLossLimit));
          setDdInput(propFirm.maxDrawdownLimit === undefined ? "" : String(propFirm.maxDrawdownLimit));
          setEditing(true);
        }}
        className="ml-auto"
      >
        Edit limits
      </Button>
    </div>
  );
}
