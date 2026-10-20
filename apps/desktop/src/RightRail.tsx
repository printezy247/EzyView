import type { ReactNode } from "react";
import { ArrowLeftRight, BarChart3, List, ListTree } from "lucide-react";
import type { PanelId } from "./Toolbar";

/** Side panels only — navigation destinations live on the left rail. */
const ITEMS: { id: PanelId; label: string; icon: ReactNode }[] = [
  { id: "watchlist", label: "Watchlist", icon: <List size={16} aria-hidden /> },
  { id: "depth", label: "Depth of market", icon: <BarChart3 size={16} aria-hidden /> },
  { id: "objects", label: "Object tree", icon: <ListTree size={16} aria-hidden /> },
  { id: "trading", label: "Order ticket & positions", icon: <ArrowLeftRight size={16} aria-hidden /> },
];

interface Props {
  panels: Record<PanelId, boolean>;
  onToggle: (id: PanelId) => void;
}

/** Icon rail on the right edge: one click shows or hides any panel, with a lit icon for each open one. */
export function RightRail({ panels, onToggle }: Props) {
  return (
    <nav aria-label="Panels" className="flex w-10 shrink-0 flex-col items-center gap-1 border-l border-ev-raised py-2">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-label={item.label}
          aria-pressed={panels[item.id]}
          title={item.label}
          onClick={() => onToggle(item.id)}
          className={`relative flex size-8 items-center justify-center rounded ${
            panels[item.id] ? "bg-ev-raised text-ev-strong" : "text-ev-muted hover:bg-ev-raised hover:text-ev-strong"
          }`}
        >
          {panels[item.id] && <span className="absolute left-0 top-1.5 h-5 w-0.5 rounded bg-ev-accent" aria-hidden />}
          {item.icon}
        </button>
      ))}
    </nav>
  );
}
