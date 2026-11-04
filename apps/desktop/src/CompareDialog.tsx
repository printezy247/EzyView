import { useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import type { CompareMode } from "@ezyview/chart-engine";
import { useWorkspace } from "./store";
import { Button, Dialog, IconButton, Input, Select } from "./ui";

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
    <Dialog
      open={open}
      onClose={onClose}
      title="Compare symbols"
      description="Overlays are normalised to the primary chart's first common bar."
      size="md"
      actions={
        <Button type="button" variant="ghost" size="lg" onClick={onClose}>
          Done
        </Button>
      }
    >

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
              <IconButton
                label={entry.visible === false ? `Show ${entry.symbol}` : `Hide ${entry.symbol}`}
                size="sm"
                aria-pressed={entry.visible === false}
                onClick={() => updateCompare(entry.id, { visible: entry.visible === false })}
              >
                {entry.visible === false ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
              </IconButton>
              <IconButton
                label={`Remove ${entry.symbol}`}
                size="sm"
                onClick={() => removeCompare(entry.id)}
                className="hover:text-ev-down-text"
              >
                <Trash2 size={12} aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

    </Dialog>
  );
}
