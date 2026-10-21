import { useState } from "react";
import { X } from "lucide-react";
import { catalog } from "@ezyview/indicators";
import type { IndicatorDef } from "@ezyview/indicators";
import { useWorkspace } from "./store";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Indicator picker: search, grouped by family, click to add to the active layout. */
export function IndicatorDialog({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const addIndicator = useWorkspace((s) => s.addIndicator);
  const active = useWorkspace((s) => s.activeChart().indicators);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const matches = catalog().filter((d) => !q || d.name.toLowerCase().includes(q) || d.id.includes(q));
  const groups = groupByFamily(matches);
  const activeIds = new Set(active.map((i) => i.def.id));

  return (
    <Modal
      onClose={onClose}
      labelledBy="indicator-dialog-title"
      className="flex h-[26rem] w-[30rem] flex-col rounded-md border border-ev-line bg-ev-panel shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-ev-raised px-4 py-2.5">
        <h2 id="indicator-dialog-title" className="text-body font-semibold text-ev-strong">
          Indicators
        </h2>
        <button type="button" onClick={onClose} className="text-ev-muted hover:text-ev-strong" aria-label="Close">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="border-b border-ev-raised px-4 py-2">
        <input
          aria-label="Search indicators"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search indicators"
          className="w-full rounded bg-ev-bg px-2.5 py-1.5 text-body text-ev-strong outline-none placeholder:text-ev-muted"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {Object.entries(groups).map(([family, defs]) => (
          <section key={family} className="mb-3">
            <h3 className="px-2 pb-1 text-dense font-semibold uppercase tracking-wider text-ev-faint">
              {family}
            </h3>
            <ul>
              {defs.map((def) => (
                <li key={def.id}>
                  <button
                    type="button"
                    onClick={() => {
                      addIndicator(def.id);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-ev-raised"
                  >
                    <span className="text-body text-ev-strong">{def.name}</span>
                    <span className="text-dense text-ev-faint">{def.pane === "overlay" ? "overlay" : "pane"}</span>
                    {activeIds.has(def.id) && (
                      <span className="ml-auto rounded bg-ev-raised px-1.5 text-dense text-ev-muted">on chart</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {matches.length === 0 && <p className="px-2 py-4 text-body text-ev-muted">No indicators match “{query}”.</p>}
      </div>
    </Modal>
  );
}

function groupByFamily(defs: IndicatorDef[]): Record<string, IndicatorDef[]> {
  const out: Record<string, IndicatorDef[]> = {};
  for (const def of defs) (out[def.family] ??= []).push(def);
  return out;
}
