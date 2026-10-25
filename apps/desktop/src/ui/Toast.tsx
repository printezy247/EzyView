import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { cn } from "./cn";
import { IconButton } from "./Button";

export type ToastTone = "info" | "success" | "warn" | "error";

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  /** Milliseconds before it disappears; 0 keeps it until dismissed. */
  timeout: number;
}

const TONE_CLASS: Record<ToastTone, string> = {
  info: "border-ev-line text-ev-text",
  success: "border-ev-up/40 text-ev-text",
  warn: "border-ev-warn/50 text-ev-text",
  error: "border-ev-down/50 text-ev-text",
};

let nextId = 1;
let messages: readonly ToastMessage[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

const emit = () => {
  for (const listener of listeners) listener();
};

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  messages = messages.filter((m) => m.id !== id);
  emit();
}

export interface ToastOptions {
  tone?: ToastTone;
  timeout?: number;
}

/** Show a transient message. Returns its id, for an explicit dismiss. */
export function toast(message: string, options: ToastOptions = {}): number {
  const id = nextId;
  nextId += 1;
  const entry: ToastMessage = {
    id,
    message,
    tone: options.tone ?? "info",
    timeout: options.timeout ?? 4000,
  };
  messages = [...messages, entry];
  if (entry.timeout > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), entry.timeout),
    );
  }
  emit();
  return id;
}

/** Test hook: empty the store and cancel its timers. */
export function clearToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  messages = [];
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => messages;

/**
 * Renders the queued toasts bottom-right.
 *
 * Rendered inside `aria-live="polite"` so a screen reader announces a saved
 * layout or a failed order without stealing focus. Errors get `role="alert"`
 * so they are announced immediately.
 */
export function Toaster() {
  const queue = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-3 right-3 z-[var(--z-toast)] flex w-[min(360px,92vw)] flex-col gap-1.5"
    >
      {queue.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded border bg-ev-panel px-2.5 py-2 text-dense shadow-xl",
            TONE_CLASS[item.tone],
          )}
        >
          <span className="flex-1">{item.message}</span>
          <IconButton label="Dismiss notification" size="sm" onClick={() => dismissToast(item.id)}>
            <span aria-hidden>×</span>
          </IconButton>
        </div>
      ))}
    </div>,
    document.body,
  );
}
