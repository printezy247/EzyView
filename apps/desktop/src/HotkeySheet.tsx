import { Modal } from "./Modal";
import { hotkeyGroups } from "./hotkeys";
import { Button } from "./ui";

/**
 * `?` shortcut sheet. Rendered from the `hotkeys.ts` table so the dialog can
 * never drift from the bindings the app implements.
 */
export function HotkeySheet({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} labelledBy="hotkeys-title">
      <div className="max-h-[80vh] w-[min(34rem,92vw)] overflow-y-auto rounded-md border border-ev-line bg-ev-panel p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="hotkeys-title" className="text-title font-semibold text-ev-strong">
            Keyboard shortcuts
          </h2>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {hotkeyGroups().map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-micro font-semibold uppercase tracking-wider text-ev-faint">
                {group.title}
              </h3>
              <dl className="flex flex-col gap-1.5">
                {group.keys.map((key) => (
                  <div key={key.combo} className="flex items-baseline justify-between gap-3">
                    <dt className="text-dense text-ev-muted">{key.description}</dt>
                    <dd className="shrink-0">
                      <kbd className="num rounded border border-ev-line bg-ev-raised px-1.5 py-0.5 text-micro text-ev-text">
                        {key.combo}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
