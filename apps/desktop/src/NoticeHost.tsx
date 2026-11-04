import { useNotice } from "./notice";
import { Button, Dialog } from "./ui";

/**
 * Renders the open notice from `notice.ts`. Mounted once by the shell so a
 * plain module (the export bridge, a factory reset) can ask a question without
 * knowing where it sits in the tree.
 */
export function NoticeHost() {
  const notice = useNotice((s) => s.notice);
  const settle = useNotice((s) => s.settle);

  return (
    <Dialog
      open={notice !== null}
      onClose={() => settle(false)}
      title={notice?.title ?? "Notice"}
      description={notice?.body}
      size="sm"
      actions={
        <>
          {notice?.kind === "confirm" && (
            <Button variant="outline" size="lg" onClick={() => settle(false)}>
              Cancel
            </Button>
          )}
          <Button
            variant={notice?.kind === "confirm" ? "solid" : "outline"}
            size="lg"
            onClick={() => settle(true)}
          >
            {notice?.kind === "confirm" ? (notice.confirmLabel ?? "Continue") : "Dismiss"}
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  );
}
