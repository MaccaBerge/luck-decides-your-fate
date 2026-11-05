import { useState } from "react";
import { ClipboardList } from "lucide-react";
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
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
          <ClipboardList className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Paste names</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">One name per line. Blank lines are ignored.</p>
        </div>
      </div>
      <textarea
        aria-label="Names, one per line"
        data-autofocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"Anna\nJonas\nPer\nKari"}
        className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {names.length} {names.length === 1 ? "name" : "names"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-full px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || names.length === 0}
            className="rounded-full bg-violet-600 px-5 py-2 font-bold text-white shadow-md shadow-violet-500/30 hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add names
          </button>
        </div>
      </div>
    </Modal>
  );
}
