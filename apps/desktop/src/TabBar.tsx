import { Copy, Plus, X } from "lucide-react";
import { useWorkspace } from "./store";

/** Layout tabs. One tab per layout; each carries its own symbol, panes and drawings. */
export function TabBar() {
  const layouts = useWorkspace((s) => s.layouts);
  const activeId = useWorkspace((s) => s.activeLayoutId);
  const dirty = useWorkspace((s) => s.dirty);
  const setActive = useWorkspace((s) => s.setActiveLayout);
  const addLayout = useWorkspace((s) => s.addLayout);
  const copyLayout = useWorkspace((s) => s.copyLayout);
  const deleteLayout = useWorkspace((s) => s.deleteLayout);

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[#1e222d] px-2">
      {layouts.map((layout) => {
        const active = layout.id === activeId;
        return (
          <div
            key={layout.id}
            className={
              active
                ? "flex items-center gap-0.5 rounded-t border-b-2 bg-[#131722]"
                : "flex items-center gap-0.5 rounded hover:bg-[#131722]"
            }
            style={active ? { borderColor: layout.color } : undefined}
          >
            <button
              type="button"
              onClick={() => setActive(layout.id)}
              aria-current={active ? "true" : undefined}
              className={
                active
                  ? "flex items-center gap-1.5 rounded-t px-2.5 py-1 text-xs font-medium text-white"
                  : "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-[#787b86] hover:text-white"
              }
            >
              {layout.name}
              {dirty[layout.id] && <span className="text-[#787b86]">•</span>}
            </button>
            {active && layouts.length > 1 && (
              <button
                type="button"
                title={`Close ${layout.name}`}
                aria-label={`Close layout ${layout.name}`}
                onClick={() => deleteLayout(layout.id)}
                className="mr-1 flex size-5 items-center justify-center rounded text-[#434651] hover:bg-[#2a2e39] hover:text-white"
              >
                <X size={12} aria-hidden />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        title="New layout"
        aria-label="New layout"
        onClick={addLayout}
        className="flex size-6 items-center justify-center rounded text-[#787b86] hover:bg-[#1e222d] hover:text-white"
      >
        <Plus size={14} aria-hidden />
      </button>
      <button
        type="button"
        title="Duplicate active layout"
        aria-label="Duplicate active layout"
        onClick={() => copyLayout(activeId)}
        className="flex size-6 items-center justify-center rounded text-[#787b86] hover:bg-[#1e222d] hover:text-white"
      >
        <Copy size={13} aria-hidden />
      </button>
    </div>
  );
}
