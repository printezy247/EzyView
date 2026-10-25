import { cn } from "./cn";
import { chipClass } from "./classNames";

export interface BadgeProps {
  children: React.ReactNode;
  tone?: "neutral" | "up" | "down" | "warn" | "accent";
  /** A leading status dot, for live/stale/error states. */
  dot?: boolean;
  title?: string;
  className?: string;
}

/**
 * A small status or count marker. Never interactive — anything clickable is a
 * Button. Tones map to the same tokens as the P&L colours, so "warn" here and
 * a stale-price chip elsewhere are the same amber.
 */
export function Badge({ children, tone = "neutral", dot, title, className }: BadgeProps) {
  const dotTone = {
    neutral: "bg-ev-muted",
    up: "bg-ev-up",
    down: "bg-ev-down",
    warn: "bg-ev-warn",
    accent: "bg-ev-accent",
  }[tone];
  return (
    <span className={cn(chipClass({ tone, className }), "gap-1")} title={title}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", dotTone)} />}
      {children}
    </span>
  );
}
