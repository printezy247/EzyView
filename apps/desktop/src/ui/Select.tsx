import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "./cn";
import { type ControlSize, LISTBOX_CLASS, optionClass, selectTriggerClass } from "./classNames";
import { popupPosition, typeaheadIndex, usePopupDismiss, wrapIndex } from "./popup";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  hint?: string;
  /** Options with the same group are rendered under one heading, in order. */
  group?: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** Accessible name for the trigger; also the listbox's label. */
  label: string;
  placeholder?: string;
  size?: ControlSize;
  disabled?: boolean;
  id?: string;
  className?: string;
  align?: "left" | "right";
  /** Custom closed-state content; defaults to the selected label. */
  renderValue?: (option: SelectOption | undefined) => ReactNode;
}

/**
 * Single-choice dropdown over a closed set.
 *
 * A native `<select>` cannot show hints, groups or token styling, so this is
 * the custom listbox — but it keeps the native contract: a labelled trigger,
 * `aria-expanded`/`aria-haspopup`, one option selected at a time, arrows and
 * Home/End to walk, Enter/Space to commit, Escape to cancel, typeahead, and
 * disabled options skipped by the keyboard.
 */
export function Select({
  value,
  onChange,
  options,
  label,
  placeholder = "Select…",
  size = "md",
  disabled,
  id,
  className,
  align = "left",
  renderValue,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ buffer: "", at: 0 });
  const generatedId = useId();
  const listId = `${id ?? generatedId}-listbox`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex === -1 ? undefined : options[selectedIndex];

  usePopupDismiss(open, () => setOpen(false), [triggerRef, listRef]);

  // The listbox owns the keyboard while it is open, so focus moves to it (not
  // to the options): the trigger keeps a stable tab stop and Escape has an
  // obvious place to return from.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const firstEnabled = (from: number, direction: 1 | -1): number => {
    for (let step = 0; step < options.length; step += 1) {
      const index = wrapIndex(options.length, from + step * direction);
      if (!options[index]?.disabled) return index;
    }
    return -1;
  };

  const openWith = (index: number) => {
    setActiveIndex(firstEnabled(index, 1));
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const move = (delta: 1 | -1) => {
    if (options.length === 0) return;
    const next = firstEnabled(activeIndex + delta, delta);
    if (next !== -1) setActiveIndex(next);
  };

  const onTriggerKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openWith(e.key === "ArrowUp" ? (selectedIndex === -1 ? options.length - 1 : selectedIndex) : selectedIndex);
    }
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(firstEnabled(0, 1));
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(firstEnabled(options.length - 1, -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      // Let the focus move on, but do not leave a stale popup behind.
      setOpen(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed.current.buffer = now - typed.current.at > 600 ? e.key : typed.current.buffer + e.key;
      typed.current.at = now;
      const hit = typeaheadIndex(
        options.map((o) => o.label),
        typed.current.buffer,
        Math.max(0, activeIndex),
      );
      if (hit !== null) setActiveIndex(hit);
    }
  };

  const placement = popupPosition(triggerRef.current, { align, minWidth: 176 });

  let lastGroup: string | undefined;
  const rows: ReactNode[] = [];
  options.forEach((option, index) => {
    if (option.group !== undefined && option.group !== lastGroup) {
      rows.push(
        <div key={`g-${option.group}`} role="presentation" className="px-2 pb-0.5 pt-1.5 text-dense font-medium uppercase tracking-wider text-ev-faint">
          {option.group}
        </div>,
      );
    }
    lastGroup = option.group;
    rows.push(
      <div
        key={`${option.value}-${index}`}
        id={`${listId}-option-${index}`}
        role="option"
        aria-selected={option.value === value}
        aria-disabled={option.disabled || undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => commit(index)}
        onMouseEnter={() => !option.disabled && setActiveIndex(index)}
        className={cn(optionClass({ active: index === activeIndex, selected: option.value === value, disabled: option.disabled }), "cursor-pointer")}
      >
        <span className="flex w-3 shrink-0 justify-center" aria-hidden>
          {option.value === value && <Check size={12} />}
        </span>
        <span className="flex-1 truncate">{option.label}</span>
        {option.hint !== undefined && <span className="text-dense text-ev-faint">{option.hint}</span>}
      </div>,
    );
  });

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openWith(selectedIndex))}
        onKeyDown={onTriggerKey}
        className={selectTriggerClass({ size, open, className })}
      >
        <span className={cn("flex-1 truncate", !selected && "text-ev-faint")}>
          {renderValue ? renderValue(selected) : (selected?.label ?? placeholder)}
        </span>
        <ChevronDown size={12} aria-hidden className="shrink-0 text-ev-muted" />
      </button>

      {open &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={activeIndex === -1 ? undefined : `${listId}-option-${activeIndex}`}
            onKeyDown={onListKey}
            className={LISTBOX_CLASS}
            style={{ top: placement.top, left: placement.left, minWidth: placement.minWidth, maxHeight: placement.maxHeight }}
          >
            {rows.length === 0 ? <div className="px-2 py-1.5 text-dense text-ev-faint">No options</div> : rows}
          </div>,
          document.body,
        )}
    </>
  );
}
