import { useState } from "react";

import { Modal } from "./Modal";
import { Button, Input } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The focused cell's current group, or null when it is on its own. */
  current: string | null;
  /** The group names already in use in this layout, for one-click joining. */
  available: string[];
  /** Apply a group name, or clear the group with an empty name. */
  onPick: (group: string) => void;
}

/**
 * Link a chart cell to a group.
 *
 * Cells in the same group share their symbol, their interval and their
 * crosshair, so a two-up of the same instrument stays in step. The group is
 * just a name — the cells in a layout that carry the same one are the group.
 *
 * The names already in use are offered as buttons, because typing "A" when
 * "A" exists is how you end up with two groups that look identical.
 */
export function LinkGroupDialog({ open, onClose, current, available, onPick }: Props) {
  const [value, setValue] = useState(current ?? "");

  const apply = (name: string) => {
    onPick(name.trim());
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="link-group-title"
      className="w-[min(24rem,92vw)] rounded-lg border border-ev-line bg-ev-panel p-4 shadow-xl"
    >
      <h2 id="link-group-title" className="text-title font-semibold text-ev-strong">
        Link this chart
      </h2>
      <p className="mt-1 text-dense text-ev-muted">
        Cells in the same group share their symbol, interval and crosshair.
      </p>

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          apply(value);
        }}
      >
        <label className="text-dense text-ev-muted" htmlFor="link-group-name">
          Group name
        </label>
        <Input
          id="link-group-name"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists to take this one value
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="A"
          aria-label="Link group name"
          className="mt-1 w-full"
        />

        {available.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-micro uppercase tracking-wider text-ev-faint">In use</span>
            {available.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => apply(g)}
                className="rounded bg-ev-raised px-1.5 py-0.5 text-dense text-ev-muted hover:bg-ev-line hover:text-ev-strong"
              >
                {g}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => apply("")}
            disabled={current === null}
            title="Take this cell out of its group"
          >
            Unlink
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="solid" size="lg" disabled={value.trim() === ""}>
              Link
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
