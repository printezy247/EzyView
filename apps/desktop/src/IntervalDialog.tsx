import { useEffect, useState } from "react";
import type { Resolution } from "@ezyview/data-adapters";

import { parseInterval } from "./intervalBuilder";
import { Button, Dialog, Field, Input } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Apply a parsed interval. Only ever called with a served resolution. */
  onPick: (resolution: Resolution) => void;
}

/**
 * Custom interval entry, opened from the toolbar's interval menu.
 *
 * `Resolution` is a closed union of the buckets the adapters serve, so this
 * dialog cannot invent a new one. When the typed request has no exact bucket it
 * says so and offers the nearest neighbour as a one-click fix — the alternative,
 * quietly showing a 5-minute chart for "7m", would misreport the data.
 *
 * Built on the shared `Dialog` (title, Escape, focus trap, footer actions) and
 * `Field` (label, error with role="alert", describedby wiring) so it behaves
 * like every other dialog instead of hand-rolling the shell.
 */
export function IntervalDialog({ open, onClose, onPick }: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);
  const result = value.trim() === "" ? null : parseInterval(value);

  const submit = () => {
    if (result?.ok) {
      onPick(result.resolution);
      setValue("");
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Custom interval"
      size="sm"
      description="Type a count and a unit — 15m, 4h, 1d. M is a month, m a minute."
      actions={
        <>
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="interval-form" variant="solid" size="lg" disabled={result === null || !result.ok}>
            Apply
          </Button>
        </>
      }
    >
      <form
        id="interval-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Interval" error={result !== null && !result.ok ? result.reason : undefined}>
          {({ controlId, describedBy, invalid }) => (
            <>
              <Input
                id={controlId}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists to take this one value
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="15m"
                aria-label="Interval"
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                className="w-full"
              />
              <p className="mt-1 min-h-5 text-dense">
                {result === null ? (
                  <span className="text-ev-faint">Waiting for an interval.</span>
                ) : result.ok ? (
                  <span className="text-ev-up-text">Shows {result.label} bars.</span>
                ) : (
                  result.suggestion && (
                    <button
                      type="button"
                      onClick={() => setValue(result.suggestion!)}
                      className="text-ev-link underline decoration-dotted underline-offset-2 hover:text-ev-strong"
                    >
                      Use {result.suggestion}
                    </button>
                  )
                )}
              </p>
            </>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
