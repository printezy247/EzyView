import { useState } from "react";
import { Button, Dialog, Input } from "./ui";

/** Asks for a template name; Enter saves, Escape or Cancel closes. */
export function TemplateNameDialog({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const submit = () => {
    if (name.trim()) {
      onSave(name);
      onClose();
    }
  };

  return (
    <Dialog
      onClose={onClose}
      title="Save chart template"
      description="Saves the chart type, options and indicators, not the symbol or drawings."
      size="sm"
      actions={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="solid" size="md" disabled={!name.trim()} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        aria-label="Template name"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Template name"
        block
      />
    </Dialog>
  );
}
