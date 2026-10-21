import { useId, useState } from "react";
import { Modal } from "./Modal";

/** Asks for a template name; Enter saves, Escape or Cancel closes. */
export function TemplateNameDialog({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const titleId = useId();
  const [name, setName] = useState("");
  const submit = () => {
    if (name.trim()) {
      onSave(name);
      onClose();
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      className="w-[min(360px,92vw)] rounded-lg border border-ev-line bg-ev-panel p-4 shadow-2xl">
      <h2 id={titleId} className="mb-2 text-body font-semibold text-ev-strong">
        Save chart template
      </h2>
      <p className="mb-2 text-dense text-ev-muted">Saves the chart type, options and indicators, not the symbol or drawings.</p>
      <input
        autoFocus
        aria-label="Template name"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Template name"
        className="mb-3 w-full rounded border border-ev-line bg-ev-bg px-2 py-1.5 text-base text-ev-strong placeholder:text-ev-faint"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-dense text-ev-muted hover:text-ev-strong">
          Cancel
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={submit}
          className="rounded bg-ev-accent px-3 py-1.5 text-dense text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
