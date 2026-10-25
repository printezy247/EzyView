import { useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { cn } from "./cn";
import { type ControlSize, segmentClass, segmentedClass } from "./classNames";

export interface SegmentOption {
  value: string;
  label: string;
  /** Tooltip/accessible description for a terse label like "1D". */
  title?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SegmentOption[];
  /** Accessible name for the group ("Favorite intervals"). */
  label: string;
  size?: ControlSize;
  className?: string;
}

/**
 * One-of-many control for a short, visible set: favorite intervals, density,
 * chart-vs-table. Rendered as a `role="group"` of toggle buttons rather than a
 * radio list because these act immediately and are not form values.
 *
 * Arrow keys move the selection, Home/End jump to the ends.
 */
export function SegmentedControl({ value, onChange, options, label, size = "md", className }: SegmentedControlProps) {
  const ref = useRef<HTMLDivElement>(null);

  const enabled = options.filter((o) => !o.disabled);
  const pick = (index: number) => {
    const option = options[index];
    if (option && !option.disabled) onChange(option.value);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (enabled.length === 0) return;
    const from = enabled.findIndex((o) => o.value === value);
    const move = (delta: 1 | -1) => {
      e.preventDefault();
      const next = enabled[(((from === -1 ? 0 : from) + delta + enabled.length) % enabled.length)]!;
      onChange(next.value);
      const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("button");
      if (buttons) buttons[[...buttons].findIndex((b) => b.dataset.value === next.value)]?.focus();
    };
    if (e.key === "ArrowRight" || e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(-1);
    else if (e.key === "Home") {
      e.preventDefault();
      onChange(enabled[0]!.value);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(enabled.at(-1)!.value);
    }
  };

  return (
    <div ref={ref} role="group" aria-label={label} onKeyDown={onKeyDown} className={segmentedClass({ size, className })}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            data-value={option.value}
            aria-pressed={active}
            aria-label={option.title ?? option.label}
            title={option.title ?? option.label}
            disabled={option.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => pick(options.indexOf(option))}
            className={cn(segmentClass({ active }), "px-1.5")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
