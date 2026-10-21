import { create } from "zustand";

/**
 * In-app message surface, replacing the native `window.alert`/`confirm` calls
 * that looked nothing like the rest of EzyView (and block the whole webview,
 * including the chart's tick loop).
 *
 * A single slot is deliberate: these are acknowledgement dialogs, not a
 * notification centre, and two stacked confirms is a worse experience than
 * the second one waiting its turn.
 */

export interface Notice {
  id: number;
  title: string;
  body?: string;
  /** `alert` shows one Dismiss button; `confirm` shows Cancel + Continue. */
  kind: "alert" | "confirm";
  /** Label for the destructive/primary action on a confirm. */
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}

interface NoticeStore {
  notice: Notice | null;
  /** Show a message. Resolves when dismissed (always `true`). */
  alert(title: string, body?: string): Promise<void>;
  /** Ask a yes/no question. Resolves `false` if cancelled (or replaced). */
  confirm(title: string, options?: { body?: string; confirmLabel?: string }): Promise<boolean>;
  /** Answer the open notice. */
  settle(ok: boolean): void;
}

let nextId = 1;

export const useNotice = create<NoticeStore>()((set, get) => {
  /** Replacing an open notice resolves it as cancelled, so a caller never hangs. */
  const open = (notice: Omit<Notice, "id">): void => {
    get().notice?.resolve(false);
    set({ notice: { ...notice, id: nextId++ } });
  };

  return {
    notice: null,
    alert: (title, body) =>
      new Promise<void>((resolve) => {
        open({
          title,
          ...(body === undefined ? {} : { body }),
          kind: "alert",
          resolve: () => resolve(),
        });
      }),
    confirm: (title, options = {}) =>
      new Promise<boolean>((resolve) => {
        open({
          title,
          ...(options.body === undefined ? {} : { body: options.body }),
          ...(options.confirmLabel === undefined ? {} : { confirmLabel: options.confirmLabel }),
          kind: "confirm",
          resolve,
        });
      }),
    settle: (ok) => {
      const { notice } = get();
      if (!notice) return;
      set({ notice: null });
      notice.resolve(ok);
    },
  };
});

/** Non-hook access for plain modules (export bridge, factories). */
export const notice = {
  alert: (title: string, body?: string): void => void useNotice.getState().alert(title, body),
  confirm: (title: string, options?: { body?: string; confirmLabel?: string }): Promise<boolean> =>
    useNotice.getState().confirm(title, options),
};
