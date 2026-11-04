import { useState } from "react";
import { catalog } from "@ezyview/indicators";
import type { IndicatorDef } from "@ezyview/indicators";
import { useWorkspace } from "./store";
import { Button, Dialog, Input } from "./ui";

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
    <Dialog
      open={open}
      onClose={onClose}
      title="Indicators"
      size="md"
      className="h-[26rem]"
      actions={
        <Button variant="ghost" size="md" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="mb-2 border-b border-ev-raised pb-2">
        <Input
          aria-label="Search indicators"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search indicators"
          block
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {Object.entries(groups).map(([family, defs]) => (
          <section key={family} className="mb-3">
            <h3 className="px-2 pb-1 text-dense font-semibold uppercase tracking-wider text-ev-faint">
              {family}
            </h3>
            <ul>
              {defs.map((def) => (
                <li key={def.id}>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      addIndicator(def.id);
                      onClose();
                    }}
                    className="w-full justify-start"
                  >
                    <span className="text-body text-ev-strong">{def.name}</span>
                    <span className="text-dense text-ev-faint">{def.pane === "overlay" ? "overlay" : "pane"}</span>
                    {activeIds.has(def.id) && (
                      <span className="ml-auto rounded bg-ev-raised px-1.5 text-dense text-ev-muted">on chart</span>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {matches.length === 0 && <p className="px-2 py-4 text-body text-ev-muted">No indicators match “{query}”.</p>}
      </div>
    </Dialog>
  );
}

function groupByFamily(defs: IndicatorDef[]): Record<string, IndicatorDef[]> {
  const out: Record<string, IndicatorDef[]> = {};
  for (const def of defs) (out[def.family] ??= []).push(def);
  return out;
}
