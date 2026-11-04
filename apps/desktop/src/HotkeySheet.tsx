import { hotkeyGroups } from "./hotkeys";
import { Button, Dialog } from "./ui";

/**
 * `?` shortcut sheet. Rendered from the `hotkeys.ts` table so the dialog can
 * never drift from the bindings the app implements.
 */
export function HotkeySheet({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      onClose={onClose}
      title="Keyboard shortcuts"
      size="lg"
      actions={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
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
    </Dialog>
  );
}
