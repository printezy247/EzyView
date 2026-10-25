import { useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import type { CompareMode } from "@ezyview/chart-engine";
import { useWorkspace } from "./store";
import { Modal } from "./Modal";
import { Button, Input, Select } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMPTY_COMPARE: import("./layout").CompareSymbol[] = [];

const MODES: { id: CompareMode; label: string }[] = [
  { id: "percent", label: "Percent" },
  { id: "ratio", label: "Ratio" },
  { id: "spread", label: "Spread" },
];

/**
 * Overlay secondary symbols on the focused chart.
 *
 * Percent is the default because two instruments at different price levels are
 * otherwise impossible to compare; ratio and spread are for pair trading.
 */
export function CompareDialog({ open, onClose }: Props) {
  // Select the stored array itself; a fresh `?? []` on every render makes
  // useSyncExternalStore loop forever.
  const compare = useWorkspace((s) => s.activeChart().compare) ?? EMPTY_COMPARE;
  const addCompare = useWorkspace((s) => s.addCompare);
  const removeCompare = useWorkspace((s) => s.removeCompare);
  const updateCompare = useWorkspace((s) => s.updateCompare);
  const [symbol, setSymbol] = useState("");
  const [mode, setMode] = useState<CompareMode>("percent");

  const add = () => {
    const value = symbol.trim().toUpperCase();
    if (!value) return;
    addCompare(value, mode);
    setSymbol("");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="compare-title"
      className="w-[min(30rem,94vw)] rounded-lg border border-ev-line bg-ev-panel p-4 shadow-xl"
    >
      <h2 id="compare-title" className="text-title font-semibold text-ev-strong">
        Compare symbols
      </h2>
      <p className="mt-1 text-dense text-ev-muted">
        Overlays are normalised to the primary chart's first common bar.
      </p>

      <form
        className="mt-3 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          autoFocus
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="NASDAQ:AAPL"
          aria-label="Compare symbol"
          className="min-w-0 flex-1"
        />
        <Select
          label="Comparison mode"
          value={mode}
          onChange={(v) => setMode(v as CompareMode)}
          options={MODES.map((m) => ({ value: m.id, label: m.label }))}
          className="px-1.5 text-dense"
        />
        <Button type="submit" variant="solid" disabled={symbol.trim() === ""}>
          Add
        </Button>
      </form>

      {compare.length === 0 ? (
        <p className="mt-4 text-dense text-ev-faint">No comparison symbols yet.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {compare.map((entry) => (
            <li key={entry.id} className="flex items-center gap-1.5 rounded bg-ev-bg px-1.5 py-1 text-dense">
              <input
                type="color"
                value={entry.color}
                onChange={(e) => updateCompare(entry.id, { color: e.target.value })}
                aria-label={`Colour for ${entry.symbol}`}
                className="size-5 shrink-0 cursor-pointer rounded border border-ev-line bg-transparent"
              />
              <span className="min-w-0 flex-1 truncate text-ev-text">{entry.symbol}</span>
              <Select
                label={`Mode for ${entry.symbol}`}
                value={entry.mode}
                onChange={(v) => updateCompare(entry.id, { mode: v as CompareMode })}
                options={MODES.map((m) => ({ value: m.id, label: m.label }))}
                size="sm"
                className="px-1 text-micro"
              />
              <button
                type="button"
                aria-label={entry.visible === false ? `Show ${entry.symbol}` : `Hide ${entry.symbol}`}
                aria-pressed={entry.visible === false}
                onClick={() => updateCompare(entry.id, { visible: entry.visible === false })}
                className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
              >
                {entry.visible === false ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
              </button>
              <button
                type="button"
                aria-label={`Remove ${entry.symbol}`}
                onClick={() => removeCompare(entry.id)}
                className="flex size-6 items-center justify-center rounded text-ev-muted hover:bg-ev-raised hover:text-ev-down-text"
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="ghost" size="lg" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
