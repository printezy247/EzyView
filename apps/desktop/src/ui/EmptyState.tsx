import type { ReactNode } from "react";

import { Button } from "./Button";

/**
 * One empty state for every page that has nothing to show yet.
 *
 * An empty page is not a failure, but it is a dead end when nothing on it
 * says what to do next. So the component always carries the one line that
 * makes the page useful ("your watchlist loads here", "alerts fire when the
 * price crosses"), and an optional action that gets out of it.
 */

export interface EmptyStateProps {
  title: string;
  body: string;
  /** Optional line under the message, e.g. a caveat about live trading. */
  hint?: string;
  icon?: ReactNode;
  /** One primary action out of the empty state. */
  action?: { label: string; onSelect: () => void };
}

export function EmptyState({ title, body, hint, icon, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && (
        <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full bg-ev-raised text-ev-muted">
          {icon}
        </span>
      )}
      <p className="text-body font-semibold text-ev-strong">{title}</p>
      <p className="max-w-md text-base leading-relaxed text-ev-muted">{body}</p>
      {action && (
        <Button size="md" onClick={action.onSelect} className="mt-2">
          {action.label}
        </Button>
      )}
      {hint && <p className="mt-1 max-w-md text-dense text-ev-faint">{hint}</p>}
    </div>
  );
}
