import type { ReactNode } from "react";
import { ArrowLeftRight, BarChart3, BookOpen, List, ListTree, Newspaper, Sigma } from "lucide-react";
import type { PanelId } from "./Toolbar";

const ITEMS: { id: PanelId; label: string; icon: ReactNode }[] = [
  { id: "watchlist", label: "Watchlist", icon: <List size={16} aria-hidden /> },
  { id: "depth", label: "Depth of market", icon: <BarChart3 size={16} aria-hidden /> },
  { id: "objects", label: "Object tree", icon: <ListTree size={16} aria-hidden /> },
  { id: "trading", label: "Order ticket & positions", icon: <ArrowLeftRight size={16} aria-hidden /> },
  { id: "fundamentals", label: "Fundamentals & screener", icon: <Newspaper size={16} aria-hidden /> },
  { id: "options", label: "Options chain", icon: <Sigma size={16} aria-hidden /> },
  { id: "journal", label: "Trading journal", icon: <BookOpen size={16} aria-hidden /> },
];

interface Props {
  panels: Record<PanelId, boolean>;
  onToggle: (id: PanelId) => void;
}

/** Icon rail on the right edge: one click shows or hides any panel, with a lit icon for each open one. */
export function RightRail({ panels, onToggle }: Props) {
  return (
    <nav aria-label="Panels" className="flex w-10 shrink-0 flex-col items-center gap-1 border-l border-[#1e222d] py-2">
      {ITEMS.map((item, index) => (
        <div key={item.id} className="contents">
          {/* Side panels above the line, bottom-slot panels below it. */}
          {index === 3 && <div className="my-1 h-px w-5 bg-[#1e222d]" aria-hidden />}
          <button
            type="button"
            aria-label={item.label}
            aria-pressed={panels[item.id]}
            title={item.label}
            onClick={() => onToggle(item.id)}
            className={`relative flex size-8 items-center justify-center rounded ${
              panels[item.id] ? "bg-[#1e222d] text-white" : "text-[#787b86] hover:bg-[#1e222d] hover:text-white"
            }`}
          >
            {panels[item.id] && <span className="absolute left-0 top-1.5 h-5 w-0.5 rounded bg-[#2962ff]" aria-hidden />}
            {item.icon}
          </button>
        </div>
      ))}
    </nav>
  );
}
