import type { ClassValue } from "clsx";

import { cn } from "./cn";

/**
 * Control heights, in px. One scale for the whole app: `sm` for inline chips
 * and dense toolbars, `md` the default, `lg` for dialog actions and anything
 * a user hits without aiming.
 */
export const CONTROL_HEIGHT = { sm: 24, md: 28, lg: 32 } as const;
export type ControlSize = keyof typeof CONTROL_HEIGHT;

export const BUTTON_SIZES: Record<ControlSize, string> = {
  sm: "h-6 gap-1 px-1.5 text-dense rounded",
  md: "h-7 gap-1.5 px-2.5 text-base rounded",
  lg: "h-8 gap-2 px-3 text-base rounded",
};

export type ButtonVariant = "solid" | "outline" | "ghost" | "danger";

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // The brand red, white text. Investing.com's primary action.
  solid: "bg-ev-accent text-white hover:bg-ev-accent-hover disabled:hover:bg-ev-accent",
  outline: "border border-ev-line bg-transparent text-ev-text hover:bg-ev-raised hover:text-ev-strong",
  ghost: "bg-transparent text-ev-muted hover:bg-ev-raised hover:text-ev-strong",
  danger: "border border-ev-down/40 bg-transparent text-ev-down-text hover:bg-ev-down/10",
};

const BASE = "inline-flex shrink-0 items-center justify-center font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The one button class. `Button`/`IconButton` in `./Button` wrap this; a few
 * trigger components (Menu, Select) need the string directly because they own
 * their own element.
 */
export function buttonClass(options: { size?: ControlSize; variant?: ButtonVariant; className?: ClassValue } = {}): string {
  const { size = "md", variant = "solid", className } = options;
  return cn(BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], className);
}

/** Square icon button; a label is mandatory at the call site. */
export function iconButtonClass(options: { size?: ControlSize; variant?: ButtonVariant; className?: ClassValue } = {}): string {
  const { size = "md", variant = "ghost", className } = options;
  const box = size === "sm" ? "size-6" : size === "lg" ? "size-8" : "size-7";
  return cn(BASE, box, "rounded", BUTTON_VARIANTS[variant], className);
}

/** Text/password/number input. `w-full` is the caller's call. */
export function inputClass(className?: ClassValue): string {
  return cn(
    "h-7 rounded border border-ev-line bg-ev-bg px-2 text-base text-ev-text",
    "placeholder:text-ev-faint focus:border-ev-accent focus:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className,
  );
}

/** Status/interval chip. Never a button. */
export function chipClass(options: { tone?: "neutral" | "up" | "down" | "warn" | "accent"; className?: ClassValue } = {}): string {
  const tones = {
    neutral: "bg-ev-raised text-ev-muted",
    up: "bg-ev-up/15 text-ev-up-text",
    down: "bg-ev-down/15 text-ev-down-text",
    // Warm, not alarming: a stale price is worth noticing, not a failure.
    warn: "bg-ev-warn/15 text-ev-warn",
    accent: "bg-ev-accent/15 text-ev-accent-text",
  } as const;
  return cn(
    "inline-flex h-4.5 shrink-0 items-center gap-1 rounded px-1 text-micro font-medium",
    tones[options.tone ?? "neutral"],
    options.className,
  );
}

/**
 * A dropdown/combobox trigger looks like an input: same height, border and
 * radius, with the chevron pushed to the far end. Kept separate from
 * `inputClass` because a trigger is a button and carries `justify-between`.
 */
export function selectTriggerClass(options: { size?: ControlSize; className?: ClassValue; open?: boolean } = {}): string {
  const { size = "md", open, className } = options;
  const height = size === "sm" ? "h-6" : size === "lg" ? "h-8" : "h-7";
  return cn(
    "inline-flex min-w-0 items-center gap-1.5 rounded border bg-ev-bg px-2 text-left text-base text-ev-text",
    "transition disabled:cursor-not-allowed disabled:opacity-50",
    height,
    open ? "border-ev-accent" : "border-ev-line hover:border-ev-dim",
    className,
  );
}

/** The floating listbox under a Select or Combobox. */
export const LISTBOX_CLASS =
  "fixed z-[var(--z-dropdown)] overflow-y-auto rounded border border-ev-line bg-ev-panel py-1 shadow-xl";

/** One row of a listbox or a menu popup. */
export function optionClass(options: { active?: boolean; selected?: boolean; disabled?: boolean } = {}): string {
  return cn(
    "flex w-full items-center gap-2 px-2 py-1 text-left text-base outline-none",
    options.disabled
      ? "cursor-not-allowed text-ev-dim"
      : options.active
        ? "bg-ev-raised text-ev-strong"
        : options.selected
          ? "text-ev-strong"
          : "text-ev-muted",
  );
}

/** Field label, hint and error text. One size, one colour each. */
export const FIELD_LABEL_CLASS = "mb-1 block text-dense font-medium text-ev-muted";
export const FIELD_HINT_CLASS = "mt-1 text-dense text-ev-faint";
export const FIELD_ERROR_CLASS = "mt-1 text-dense text-ev-down-text";

/** Inputs in an error state get the danger border, not a red glow. */
export function invalidClass(invalid?: boolean): string {
  return invalid ? "border-ev-down focus:border-ev-down" : "";
}

/** Segmented control: one container, equal-height options, no gaps. */
export function segmentedClass(options: { size?: ControlSize; className?: ClassValue } = {}): string {
  const { size = "md", className } = options;
  const height = size === "sm" ? "h-6" : size === "lg" ? "h-8" : "h-7";
  return cn("inline-flex shrink-0 items-stretch rounded border border-ev-line bg-ev-bg p-0.5", height, className);
}

/** One segment. `active` is the selected one. */
export function segmentClass(options: { active?: boolean; className?: ClassValue } = {}): string {
  return cn(
    "inline-flex items-center justify-center rounded px-2 text-dense font-medium transition",
    "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
    options.active
      ? "bg-ev-accent/20 text-ev-accent-text"
      : "text-ev-muted hover:bg-ev-raised hover:text-ev-strong",
    options.className,
  );
}

/** Dialog surface: one radius, one border, one shadow. */
export const DIALOG_CLASS = "flex max-h-[85vh] flex-col rounded border border-ev-line bg-ev-panel shadow-2xl";

/** Table row. Compact by default.
 *
 * Every row carries the `.ev-row` marker so the root `[data-density]` rule in
 * `styles.css` can stretch it without each table knowing about density. The
 * explicit `density` prop is for the rare row that must opt out of that
 * global setting; it wins, because `tailwind-merge` keeps the last height.
 */
export function rowClass(options: { density?: "compact" | "comfortable"; selected?: boolean; className?: ClassValue } = {}): string {
  const h = options.density === "comfortable" ? "h-8" : options.density === "compact" ? "h-6" : "";
  return cn("num ev-row flex items-center px-2 text-dense", h, options.selected ? "bg-ev-raised" : "", options.className);
}
