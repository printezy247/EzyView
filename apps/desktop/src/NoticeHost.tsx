import { useNotice } from "./notice";
import { Modal } from "./Modal";
import { Button } from "./ui";

/**
 * Renders the open notice from `notice.ts`. Mounted once by the shell so a
 * plain module (the export bridge, a factory reset) can ask a question without
 * knowing where it sits in the tree.
 */
export function NoticeHost() {
  const notice = useNotice((s) => s.notice);
  const settle = useNotice((s) => s.settle);

  return (
    <Modal open={notice !== null} onClose={() => settle(false)} labelledBy="notice-title">
      <div className="w-96 rounded-md border border-ev-line bg-ev-panel p-4 shadow-2xl">
        <h2 id="notice-title" className="text-body font-semibold text-ev-strong">
          {notice?.title}
        </h2>
        {notice?.body && <p className="mt-2 text-base text-ev-muted">{notice.body}</p>}
        <div className="mt-4 flex justify-end gap-2">
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
        </div>
      </div>
    </Modal>
  );
}
