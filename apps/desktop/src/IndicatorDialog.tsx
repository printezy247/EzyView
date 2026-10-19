import { useState } from "react";
import { X } from "lucide-react";
import { catalog } from "@ezyview/indicators";
import type { IndicatorDef } from "@ezyview/indicators";
import { useWorkspace } from "./store";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Indicator picker: search, grouped by family, click to add to the active layout. */
export function IndicatorDialog({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const addIndicator = useWorkspace((s) => s.addIndicator);
  const active = useWorkspace((s) => s.activeLayout().state.indicators);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const matches = catalog().filter((d) => !q || d.name.toLowerCase().includes(q) || d.id.includes(q));
  const groups = groupByFamily(matches);
  const activeIds = new Set(active.map((i) => i.def.id));

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex h-[26rem] w-[30rem] flex-col rounded-md border border-[#2a2e39] bg-[#131722] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1e222d] px-4 py-2.5">
          <h2 className="text-sm font-semibold text-white">Indicators</h2>
          <button type="button" onClick={onClose} className="text-[#787b86] hover:text-white" aria-label="Close">
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="border-b border-[#1e222d] px-4 py-2">
          <input
            aria-label="Search indicators"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search indicators"
            className="w-full rounded bg-[#0e1117] px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-[#787b86]"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {Object.entries(groups).map(([family, defs]) => (
            <section key={family} className="mb-3">
              <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#434651]">
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
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[#1e222d]"
                    >
                      <span className="text-sm text-white">{def.name}</span>
                      <span className="text-[11px] text-[#434651]">{def.pane === "overlay" ? "overlay" : "pane"}</span>
                      {activeIds.has(def.id) && (
                        <span className="ml-auto rounded bg-[#1e222d] px-1.5 text-[10px] text-[#787b86]">on chart</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {matches.length === 0 && <p className="px-2 py-4 text-sm text-[#787b86]">No indicators match “{query}”.</p>}
        </div>
      </div>
    </div>
  );
}

function groupByFamily(defs: IndicatorDef[]): Record<string, IndicatorDef[]> {
  const out: Record<string, IndicatorDef[]> = {};
  for (const def of defs) (out[def.family] ??= []).push(def);
  return out;
}
