import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * One row in a dropdown: an action, a checkable option, a divider or a heading.
 * Headings and separators are how features get grouped instead of spread across
 * a row of look-alike buttons.
 */
export type MenuEntry =
  | { kind: "action"; id: string; label: string; hint?: string; disabled?: boolean; onSelect: () => void }
  | { kind: "toggle"; id: string; label: string; checked: boolean; onSelect: () => void }
  | { kind: "radio"; id: string; label: string; selected: boolean; onSelect: () => void }
  | { kind: "separator"; id: string }
  | { kind: "label"; id: string; label: string };

interface Props {
  label: string;
  /** Accessible name for the popup; defaults to the trigger text. */
  caption?: string;
  entries: MenuEntry[];
  icon?: ReactNode;
  /** Count pill on the trigger (e.g. loaded indicators). */
  badge?: number;
  /** Keep the trigger visually lit while its feature is on. */
  triggerActive?: boolean;
  align?: "left" | "right";
}

/**
 * One dropdown pattern for the whole app: trigger + popup menu.
 *
 * Keyboard contract: Enter/Space or click open it, arrows and Home/End walk the
 * items, Escape closes and returns focus to the trigger, a click anywhere
 * outside closes it. Checkbox items (panels, volume) and radio items (chart
 * type, theme) report state through aria-checked rather than colour alone.
 */
export function Menu({ label, caption, entries, icon, badge, triggerActive, align = "left" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openToEnd = useRef(false);
  const menuId = useId();

  const items = (): HTMLButtonElement[] => [
    ...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-menu-item]") ?? []),
  ];

  const cycle = (delta: number) => {
    const all = items();
    if (all.length === 0) return;
    const current = all.indexOf(document.activeElement as HTMLButtonElement);
    const next = current === -1 ? (delta > 0 ? 0 : all.length - 1) : (current + delta + all.length) % all.length;
    all[next]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // App shortcuts listen for Escape too; a open menu swallows it first.
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Park focus on the first (or last) item as soon as the popup is on screen.
  useEffect(() => {
    if (!open) return;
    const all = items();
    const target = openToEnd.current ? all.at(-1) : all[0];
    openToEnd.current = false;
    target?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (entry: MenuEntry) => {
    // Dividers and headings are not clickable; everything else carries a hook.
    if ("onSelect" in entry) entry.onSelect();
    setOpen(false);
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cycle(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cycle(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      items()[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items().at(-1)?.focus();
    } else if (e.key === "Tab") {
      // Leaving the menu dismisses it instead of stranding it open.
      setOpen(false);
    }
  };

  const triggerTone = open || triggerActive ? "bg-[#1e222d] text-white" : "text-[#787b86] hover:bg-[#1e222d] hover:text-white";

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openToEnd.current = e.key === "ArrowUp";
            setOpen(true);
          }
        }}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${triggerTone}`}
      >
        {icon}
        {label}
        {badge !== undefined && badge > 0 && (
          <span className="rounded bg-[#2962ff] px-1 text-[10px] leading-4 text-white">{badge}</span>
        )}
        <ChevronDown size={12} aria-hidden />
      </button>

      {open && (
        <div
          id={menuId}
          ref={listRef}
          role="menu"
          aria-label={caption ?? label}
          onKeyDown={onListKey}
          className={`absolute top-full z-30 mt-1 min-w-44 rounded border border-[#2a2e39] bg-[#131722] py-1 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {entries.map((entry) => {
            if (entry.kind === "separator") {
              return <div key={entry.id} role="separator" className="my-1 h-px bg-[#1e222d]" />;
            }
            if (entry.kind === "label") {
              return (
                <div key={entry.id} className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-[#434651]">
                  {entry.label}
                </div>
              );
            }

            const on = entry.kind === "toggle" ? entry.checked : entry.kind === "radio" ? entry.selected : false;
            const role = entry.kind === "toggle" ? "menuitemcheckbox" : entry.kind === "radio" ? "menuitemradio" : "menuitem";
            const disabled = entry.kind === "action" ? entry.disabled === true : false;

            return (
              <button
                key={entry.id}
                type="button"
                role={role}
                aria-checked={entry.kind === "action" ? undefined : on}
                data-menu-item
                disabled={disabled}
                onClick={() => pick(entry)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  on ? "text-white" : "text-[#787b86]"
                } hover:bg-[#1e222d] hover:text-white disabled:pointer-events-none disabled:opacity-40`}
              >
                <span className="flex w-3 shrink-0 justify-center" aria-hidden>
                  {on && <Check size={12} />}
                </span>
                <span className="flex-1">{entry.label}</span>
                {entry.kind === "action" && entry.hint !== undefined && (
                  <span className="text-[10px] text-[#434651]">{entry.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
