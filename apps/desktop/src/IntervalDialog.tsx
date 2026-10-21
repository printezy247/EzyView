import { useState } from "react";
import type { Resolution } from "@ezyview/data-adapters";

import { parseInterval } from "./intervalBuilder";
import { Modal } from "./Modal";
import { Button, Input } from "./ui";

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
 */
export function IntervalDialog({ open, onClose, onPick }: Props) {
  const [value, setValue] = useState("");
  const result = value.trim() === "" ? null : parseInterval(value);

  const submit = () => {
    if (result?.ok) {
      onPick(result.resolution);
      setValue("");
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="interval-dialog-title"
      className="w-[22rem] rounded-lg border border-ev-line bg-ev-panel p-4 shadow-xl"
    >
      <h2 id="interval-dialog-title" className="text-title font-semibold text-ev-strong">
        Custom interval
      </h2>
      <p className="mt-1 text-dense text-ev-muted">
        Type a count and a unit — <span className="num">15m</span>, <span className="num">4h</span>,{" "}
        <span className="num">1d</span>. <span className="num">M</span> is a month, <span className="num">m</span> a
        minute.
      </p>

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists to take this one value
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="15m"
          aria-label="Interval"
          aria-invalid={result !== null && !result.ok}
          aria-describedby="interval-dialog-help"
          className="w-full"
        />

        <p id="interval-dialog-help" className="mt-2 min-h-[2.5rem] text-dense">
          {result === null ? (
            <span className="text-ev-faint">Waiting for an interval.</span>
          ) : result.ok ? (
            <span className="text-ev-up">Shows {result.label} bars.</span>
          ) : (
            <span className="text-ev-down">
              {result.reason}
              {result.suggestion && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setValue(result.suggestion!)}
                    className="text-ev-link underline decoration-dotted underline-offset-2 hover:text-ev-strong"
                  >
                    Use {result.suggestion}
                  </button>
                </>
              )}
            </span>
          )}
        </p>

        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="solid" size="lg" disabled={result === null || !result.ok}>
            Apply
          </Button>
        </div>
      </form>
    </Modal>
  );
}
