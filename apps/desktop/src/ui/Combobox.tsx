import { useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { cn } from "./cn";
import { type ControlSize, LISTBOX_CLASS, inputClass, optionClass } from "./classNames";
import type { SelectOption } from "./Select";
import { popupPosition, usePopupDismiss } from "./popup";

export interface ComboboxProps {
  /** The text in the field; may be a free value the user typed. */
  value: string;
  /** Called on every keystroke (and when an option is picked). */
  onChange: (text: string) => void;
  /** Called only when an option row is picked; use it to run the lookup. */
  onSelect?: (option: SelectOption) => void;
  options: readonly SelectOption[];
  label: string;
  placeholder?: string;
  size?: ControlSize;
  disabled?: boolean;
  /** Allow text with no matching option (symbol search does; timezone does not). */
  allowCustom?: boolean;
  emptyLabel?: string;
  loading?: boolean;
  id?: string;
  className?: string;
}

/**
 * Editable single-value field with a filtered list of suggestions.
 *
 * The field stays an `<input role="combobox">`: `aria-expanded`,
 * `aria-controls` and `aria-activedescendant` point at the popup listbox, so
 * the value and the highlighted suggestion are both announced. Picking a row
 * fires `onSelect`; typing only fires `onChange`, which lets a caller decide
 * whether unknown text is valid.
 */
export function Combobox({
  value,
  onChange,
  onSelect,
  options,
  label,
  placeholder,
  size = "md",
  disabled,
  allowCustom = true,
  emptyLabel = "No matches",
  loading,
  id,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const listId = `${id ?? generatedId}-listbox`;
  const inputId = id ?? generatedId;

  const text = query ?? value;
  const needle = text.trim().toLowerCase();
  const filtered =
    needle === "" ? options : options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle));

  usePopupDismiss(open, () => {
    setOpen(false);
    setQuery(null);
  }, [inputRef, listRef]);

  const openWith = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const pick = (index: number) => {
    const option = filtered[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    onSelect?.(option);
    setQuery(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  const commitTyped = () => {
    if (!allowCustom) {
      setQuery(null);
      setOpen(false);
      return;
    }
    onChange(text);
    onSelect?.({ value: text, label: text });
    setQuery(null);
    setOpen(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openWith(filtered.length > 0 ? 0 : -1);
      else setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openWith(filtered.length - 1);
      else setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActiveIndex(filtered.length - 1);
    } else if (e.key === "Enter") {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        pick(activeIndex);
      } else if (open) {
        e.preventDefault();
        commitTyped();
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setQuery(null);
      }
    }
  };

  const placement = popupPosition(inputRef.current, { minWidth: 200, width: inputRef.current?.getBoundingClientRect().width });

  return (
    <>
      <div className={cn("relative inline-flex min-w-0 items-center", className)}>
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            if (!open) setOpen(true);
            setActiveIndex(e.target.value === "" ? -1 : 0);
          }}
          onFocus={() => {
            if (!open && options.length > 0) openWith(-1);
          }}
          onBlur={() => {
            setOpen(false);
            setQuery(null);
          }}
          onKeyDown={onKeyDown}
          className={cn(inputClass(), "w-full", size === "sm" && "h-6", size === "lg" && "h-8")}
        />
      </div>

      {open &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
            className={LISTBOX_CLASS}
            style={{ top: placement.top, left: placement.left, minWidth: placement.minWidth, maxHeight: placement.maxHeight }}
          >
            {loading ? (
              <div className="px-2 py-1.5 text-dense text-ev-faint">Searching…</div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-1.5 text-dense text-ev-faint">{allowCustom ? "Press Enter to use this value" : emptyLabel}</div>
            ) : (
              filtered.map((option, index) => (
                <div
                  key={`${option.value}-${index}`}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(index)}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  className={cn(optionClass({ active: index === activeIndex, selected: option.value === value, disabled: option.disabled }), "cursor-pointer")}
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.hint !== undefined && <span className="text-dense text-ev-faint">{option.hint}</span>}
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
