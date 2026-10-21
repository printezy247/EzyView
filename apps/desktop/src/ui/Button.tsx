import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";
import { type ButtonVariant, type ControlSize, buttonClass, chipClass, iconButtonClass, inputClass } from "./classNames";

/**
 * The shared control set. Every button, input and chip in the app comes from
 * here so heights, radii, type size and focus behaviour cannot drift file by
 * file. Styling lives in `./classNames` (unit-tested); this file is only the
 * element wiring.
 */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ControlSize;
  variant?: ButtonVariant;
}

export function Button({ size = "md", variant = "solid", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ size, variant, className })} {...rest} />;
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only control is unusable to a screen reader without it. */
  label: string;
  size?: ControlSize;
  variant?: ButtonVariant;
}

export function IconButton({ label, size = "md", variant = "ghost", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={iconButtonClass({ size, variant, className })}
      {...rest}
    />
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Stretch to the container. Off for inputs sized by their own `w-*`. */
  block?: boolean;
}

export function Input({ className, block, ...rest }: InputProps) {
  return <input className={inputClass(cn(block && "w-full", className))} {...rest} />;
}

export interface ChipProps {
  children: ReactNode;
  tone?: "neutral" | "up" | "down" | "accent";
  className?: string;
  title?: string;
}

export function Chip({ children, tone, className, title }: ChipProps) {
  return (
    <span className={chipClass({ tone, className })} title={title}>
      {children}
    </span>
  );
}
