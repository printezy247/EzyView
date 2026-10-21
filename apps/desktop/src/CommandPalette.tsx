import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { type Command, type CommandGroup, flattenGroups } from "./commandRegistry";

export type { Command, CommandGroup };

/** Flatten menu groups into runnable commands; headings and dividers drop out. */
export const toCommands = flattenGroups;

/** Every word of the query must appear in "group label", in any order. */
export function matchCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  return commands.filter((c) => {
    const text = `${c.group} ${c.label}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  groups: CommandGroup[];
}

/**
 * Search-anything launcher (Ctrl+K): every menu item in the app, one text box
 * away. It reads the same entries the toolbar menus show, so a feature added
 * to a menu is automatically reachable here too.
 */
export function CommandPalette({ open, onClose, groups }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => matchCommands(toCommands(groups), query), [groups, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row on screen while arrowing through a long list.
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  if (!open) return null;

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        className="w-[min(560px,92vw)] overflow-hidden rounded-lg border border-ev-line bg-ev-panel shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-ev-raised px-3">
          <Search size={14} aria-hidden className="text-ev-muted" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-label="Search features"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features — e.g. options, rsi, dark theme"
            className="h-11 flex-1 bg-transparent text-body text-ev-strong placeholder:text-ev-faint focus:outline-none"
          />
          <kbd className="rounded border border-ev-line px-1.5 text-dense text-ev-muted">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Features" className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-3 text-base text-ev-muted">No feature matches “{query}”.</li>}
          {results.map((c, i) => (
            <li
              key={c.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-base ${
                i === active ? "bg-ev-raised text-ev-strong" : "text-ev-muted"
              }`}
            >
              <span className="w-20 shrink-0 text-dense uppercase tracking-wider text-ev-faint">{c.group}</span>
              <span className="flex-1">{c.label}</span>
              {c.on && <Check size={12} aria-label="on" className="text-ev-accent-text" />}
              {c.hint && <kbd className="text-dense text-ev-faint">{c.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
