import { useId } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Modal } from "../Modal";
import { cn } from "./cn";
import { DIALOG_CLASS } from "./classNames";
import { IconButton } from "./Button";

const WIDTHS = {
  sm: "w-[min(360px,92vw)]",
  md: "w-[min(520px,92vw)]",
  lg: "w-[min(680px,92vw)]",
  xl: "w-[min(880px,94vw)]",
} as const;

export interface DialogProps {
  open?: boolean;
  onClose: () => void;
  title: string;
  /** One sentence explaining what the dialog is for; announced with the title. */
  description?: string;
  children: ReactNode;
  /** Footer actions (Apply/Cancel). Laid out right-aligned. */
  actions?: ReactNode;
  /** Extra content in the header, left of the close button (a badge, a tab strip). */
  headerExtra?: ReactNode;
  size?: keyof typeof WIDTHS;
  className?: string;
}

/**
 * The shell every dialog shares: a titled surface, a scrollable body and a
 * pinned action row. Built on `Modal`, so Escape, the focus trap and returning
 * focus to the opener are already handled — a dialog only supplies content.
 */
export function Dialog({
  open = true,
  onClose,
  title,
  description,
  children,
  actions,
  headerExtra,
  size = "md",
  className,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={description ? descriptionId : undefined}
      className={cn(DIALOG_CLASS, WIDTHS[size], className)}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-ev-line px-3 py-2">
        <h2 id={titleId} className="text-body font-semibold text-ev-strong">
          {title}
        </h2>
        {headerExtra}
        <IconButton label="Close dialog" size="sm" onClick={onClose} className="ml-auto">
          <X size={13} aria-hidden />
        </IconButton>
      </div>
      {description && (
        <p id={descriptionId} className="shrink-0 px-3 pt-2 text-dense text-ev-muted">
          {description}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">{children}</div>
      {actions && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-ev-line px-3 py-2">{actions}</div>}
    </Modal>
  );
}
