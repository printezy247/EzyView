import { useEffect, useState } from "react";

import { Button, Dialog, Field, Input } from "./ui";

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

  useEffect(() => {
    setValue(current ?? "");
  }, [open, current]);

  const apply = (name: string) => {
    onPick(name.trim());
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Link this chart"
      size="sm"
      description="Cells in the same group share their symbol, interval and crosshair."
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="mr-auto"
            onClick={() => apply("")}
            disabled={current === null}
            title="Take this cell out of its group"
          >
            Unlink
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="link-group-form" variant="solid" size="lg" disabled={value.trim() === ""}>
            Link
          </Button>
        </>
      }
    >
      <form
        id="link-group-form"
        onSubmit={(e) => {
          e.preventDefault();
          apply(value);
        }}
      >
        <Field label="Group name" hint="Pick a name already in use, or type a new one.">
          {({ controlId }) => (
            <Input
              id={controlId}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists to take this one value
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="A"
              aria-label="Link group name"
              className="w-full"
            />
          )}
        </Field>

        {available.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-micro uppercase tracking-wider text-ev-faint">In use</span>
            {available.map((g) => (
              <Button key={g} type="button" size="sm" variant="outline" onClick={() => apply(g)}>
                {g}
              </Button>
            ))}
          </div>
        )}
      </form>
    </Dialog>
  );
}
