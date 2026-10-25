import { useId, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { cn } from "./cn";

export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
  /** Optional count or status shown after the label. */
  badge?: string | number;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tab list ("Panels", "Chart settings"). */
  label: string;
  className?: string;
  /** Classes for one tab; the active one gets the accent underline. */
  tabClassName?: string;
  /** Id prefix for `aria-controls`; tabs get `${idPrefix}-tab-${item.id}`. */
  idPrefix?: string;
}

/** Id of a tab's element, for `aria-labelledby` on the panel. */
export function tabId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

/** Id of a tab's panel, for `aria-controls` on the tab. */
export function tabPanelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

/**
 * A tab list with roving focus: only the active tab is in the tab order, and
 * Left/Right/Home/End move the selection. That is the WAI-ARIA tabs pattern
 * and it is what makes a dock usable without a mouse.
 */
export function Tabs({ items, value, onChange, label, className, tabClassName, idPrefix }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const generated = useId();
  const prefix = idPrefix ?? generated;

  const enabled = items.filter((i) => !i.disabled);
  const currentIndex = items.findIndex((i) => i.id === value);

  const focusTab = (index: number) => {
    const tab = listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[index];
    tab?.focus();
  };

  const select = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    onChange(item.id);
    // Move focus with the selection so the next arrow press continues from here.
    queueMicrotask(() => focusTab(index));
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;
    const step = (delta: 1 | -1) => {
      e.preventDefault();
      if (enabled.length === 0) return;
      const from = enabled.findIndex((i) => i.id === value);
      const next = enabled[(((from === -1 ? 0 : from) + delta + enabled.length) % enabled.length)]!;
      select(items.indexOf(next));
    };
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Home") {
      e.preventDefault();
      const first = items.indexOf(enabled[0] ?? items[0]!);
      select(first);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = items.indexOf(enabled.at(-1) ?? items.at(-1)!);
      select(last);
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("flex items-stretch gap-0.5 overflow-x-auto", className)}
    >
      {items.map((item, index) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={tabId(prefix, item.id)}
            aria-selected={active}
            aria-controls={tabPanelId(prefix, item.id)}
            aria-disabled={item.disabled || undefined}
            tabIndex={active || (currentIndex === -1 && index === 0) ? 0 : -1}
            disabled={item.disabled}
            onClick={() => select(index)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-2 py-1 text-dense font-medium transition",
              active
                ? "border-ev-accent text-ev-strong"
                : "border-transparent text-ev-muted hover:border-ev-line-strong hover:text-ev-strong",
              "disabled:cursor-not-allowed disabled:opacity-50",
              tabClassName,
            )}
          >
            {item.label}
            {item.badge !== undefined && (
              <span className="rounded bg-ev-raised px-1 text-micro leading-4 text-ev-muted">{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
