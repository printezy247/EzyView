import { useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";
import {
  FIELD_ERROR_CLASS,
  FIELD_HINT_CLASS,
  FIELD_LABEL_CLASS,
  inputClass,
  invalidClass,
} from "./classNames";

export interface FieldIds {
  /** Space-joined hint and error ids, for `aria-describedby`. */
  describedBy: string | undefined;
  /** True when an error is shown; controls should set `aria-invalid`. */
  invalid: boolean;
  controlId: string;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Id of the control, so the label points at it. Generated when omitted. */
  htmlFor?: string;
  className?: string;
  /** Render the control with the field's ids, or pass plain children. */
  children: ReactNode | ((ids: FieldIds) => ReactNode);
}

/**
 * Label + control + hint/error, wired together: the label points at the
 * control and the hint and error are in `aria-describedby`. Errors also carry
 * `role="alert"` so they are announced the moment validation fails.
 */
export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  const generated = useId();
  const controlId = htmlFor ?? generated;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const ids: FieldIds = { describedBy, invalid: Boolean(error), controlId };

  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={controlId} className={FIELD_LABEL_CLASS}>
        {label}
        {required && (
          <span className="text-ev-down-text" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {typeof children === "function" ? children(ids) : children}
      {hint && (
        <p id={hintId} className={FIELD_HINT_CLASS}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={FIELD_ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
}

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}

/** A checkbox with its label as the hit target; the whole row toggles. */
export function Checkbox({ label, checked, onChange, disabled, hint }: CheckboxProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-base text-ev-text">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="size-3.5 shrink-0 accent-ev-accent"
        />
        {label}
      </label>
      {hint && (
        <p id={hintId} className="ml-5.5 text-dense text-ev-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** Group legend; also the accessible name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly RadioOption[];
  /** Inline for 2–3 short options, stacked otherwise. */
  inline?: boolean;
}

export function RadioGroup({ label, value, onChange, options, inline }: RadioGroupProps) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className={FIELD_LABEL_CLASS}>{label}</legend>
      <div className={cn("flex gap-3", inline ? "flex-row flex-wrap" : "flex-col gap-1")}>
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 text-base text-ev-text">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="size-3.5 shrink-0 accent-ev-accent"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}

/** An immediate on/off switch; `role="switch"` reports the state, not the colour. */
export function Toggle({ label, checked, onChange, disabled, hint }: ToggleProps) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex items-center gap-2 text-left text-base text-ev-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          aria-hidden
          className={cn(
            "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition",
            checked ? "border-ev-accent bg-ev-accent/40" : "border-ev-line bg-ev-raised",
          )}
        >
          <span
            className={cn(
              "absolute size-3 rounded-full transition",
              checked ? "left-3.5 bg-ev-accent-text" : "left-0.5 bg-ev-muted",
            )}
          />
        </span>
        {label}
      </button>
      {hint && (
        <p id={hintId} className="text-dense text-ev-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Formats the visible value ("2.5×", "68%"). */
  format?: (value: number) => string;
  disabled?: boolean;
}

export function Slider({ label, value, min, max, step = 1, onChange, format, disabled }: SliderProps) {
  const id = useId();
  const text = format ? format(value) : String(value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={FIELD_LABEL_CLASS}>
          {label}
        </label>
        <span className="num text-dense text-ev-muted">{text}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-ev-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max" | "step"> {
  label: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimal places kept on commit; omit to keep the typed number. */
  precision?: number;
  /** Suffix shown inside the field ("%", "×"). */
  unit?: string;
  hint?: string;
  error?: string;
  /** Label to the left of the field instead of above it (toolbars, dense rows). */
  inline?: boolean;
}

/**
 * A numeric field that does not fight the user mid-typing: the draft text is
 * local, and the value is clamped and committed on blur or Enter. Clearing the
 * field reports `null` (used by "auto" box sizes), and unparsable text reverts
 * to the last good value instead of silently becoming NaN.
 */
export function NumberInput({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  precision,
  unit,
  hint,
  error,
  inline,
  className,
  ...rest
}: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : String(value));

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === "") {
      onValueChange(null);
      return;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (precision !== undefined) next = Number(next.toFixed(precision));
    onValueChange(next);
  };

  const renderInput = (controlId: string, describedBy: string | undefined, invalid: boolean) => (
    <div className="relative flex items-center">
      <input
        id={controlId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(null);
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = Number(shown === "" ? (min ?? 0) : shown) || 0;
            const next = base + (e.key === "ArrowUp" ? step : -step);
            onValueChange(min !== undefined ? Math.max(min, next) : next);
            setDraft(null);
          }
        }}
        className={cn(inputClass(), "w-full num", unit && "pr-6", invalidClass(invalid))}
        {...rest}
      />
      {unit && (
        <span className="pointer-events-none absolute right-2 text-dense text-ev-faint" aria-hidden>
          {unit}
        </span>
      )}
    </div>
  );

  // Toolbar variant: the label sits beside the field, so a 36px strip stays 36px.
  const inlineId = useId();
  if (inline) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <label htmlFor={inlineId} className="shrink-0 text-dense text-ev-muted" title={hint ?? label}>
          {label}
        </label>
        <div className="w-16 shrink-0">{renderInput(inlineId, undefined, Boolean(error))}</div>
      </div>
    );
  }

  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {({ controlId, describedBy, invalid }) => renderInput(controlId, describedBy, invalid)}
    </Field>
  );
}

export interface DatePickerProps {
  label: string;
  /** `YYYY-MM-DD`, or "" for no value. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
}

/** A calendar date field. Native `<input type="date">` keeps the OS picker and keyboard support. */
export function DatePicker({ label, value, onChange, min, max, hint, error, disabled }: DatePickerProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {({ controlId, describedBy, invalid }) => (
        <input
          id={controlId}
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass(), "w-full num", invalidClass(invalid))}
        />
      )}
    </Field>
  );
}
