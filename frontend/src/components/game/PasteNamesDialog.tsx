import { useState } from "react";
import { primaryBtn, quietBtn } from "./buttons";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (names: string[]) => Promise<boolean>;
}

export function PasteNamesDialog({ open, onClose, onSubmit }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const names = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const close = () => {
    setText("");
    onClose();
  };

  const submit = async () => {
    if (names.length === 0) return;
    setBusy(true);
    const ok = await onSubmit(names);
    setBusy(false);
    if (ok) close();
  };

  return (
    <Modal open={open} onClose={close} label="Paste names">
      <h2 className="text-xl font-bold">Paste names</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">Put one name on each line.</p>
      <textarea
        aria-label="Names, one per line"
        data-autofocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"Anna\nJonas\nPer\nKari"}
        className="w-full resize-y rounded-md border border-line bg-transparent px-3 py-2.5 text-base text-ink placeholder:text-muted"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {names.length} {names.length === 1 ? "name" : "names"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            className={quietBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || names.length === 0}
            className={primaryBtn}
          >
            Add names
          </button>
        </div>
      </div>
    </Modal>
  );
}
