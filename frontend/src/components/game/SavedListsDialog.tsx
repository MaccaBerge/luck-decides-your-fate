import { useEffect, useState } from "react";
import { deleteList, MAX_LISTS, MAX_NAME_LENGTH, readLists, saveList, type SavedList } from "../../lib/savedLists";
import { Modal } from "./Modal";
import { darkBtn, pillBtn, secondaryBtn } from "./buttons";

interface Props {
  open: boolean;
  /** Every name on the wheel, hidden ones included, in position order. */
  names: string[];
  disabled: boolean;
  onClose: () => void;
  onLoad: (list: SavedList) => Promise<boolean>;
}

const SAVE_ERRORS = {
  invalid: "That list can't be saved.",
  full: `You can keep up to ${MAX_LISTS} lists. Delete one to save another.`,
  storage: "This browser wouldn't let the site save the list.",
};

export function SavedListsDialog({ open, names, disabled, onClose, onLoad }: Props) {
  const [lists, setLists] = useState<SavedList[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setLists(readLists());
  }, [open]);

  const trimmed = name.trim();
  const replaces = lists.some((l) => l.name === trimmed);

  const close = () => {
    setName("");
    setError(null);
    setConfirmingId(null);
    onClose();
  };

  const save = () => {
    const result = saveList(trimmed, names);
    if (result.ok) {
      setName("");
      setError(null);
      setLists(readLists());
    } else {
      setError(SAVE_ERRORS[result.reason]);
    }
  };

  const remove = (id: string) => {
    if (!deleteList(id)) setError("This browser wouldn't let the site delete the list.");
    setConfirmingId(null);
    setLists(readLists());
  };

  const load = async (list: SavedList) => {
    setBusy(true);
    const ok = await onLoad(list);
    setBusy(false);
    if (ok) close();
  };

  return (
    <Modal open={open} onClose={close} label="Saved lists">
      <h2 className="font-display text-[21px] font-semibold">Saved lists</h2>
      <p className="mt-0.5 mb-4 text-sm text-ink-muted">Lists stay in this browser until you load one onto a wheel.</p>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && names.length > 0) save();
        }}
      >
        <input
          aria-label="List name"
          data-autofocus
          placeholder="Name this list"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border-strong bg-surface-muted px-3.5 text-[15px] text-ink placeholder:text-ink-muted"
        />
        <button type="submit" disabled={!trimmed || names.length === 0} className={darkBtn}>
          Save list
        </button>
      </form>
      {names.length === 0 && <p className="mt-2 text-sm text-ink-muted">Add some names to the wheel to save them.</p>}
      {replaces && names.length > 0 && (
        <p className="mt-2 text-sm text-warn-ink [overflow-wrap:anywhere]">This replaces your saved list "{trimmed}".</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {lists.length > 0 && (
        // Scrolling clips at the list's edge, so the padding leaves room for focus rings.
        <ul className="-mx-2 mt-4 flex max-h-[40dvh] flex-col overflow-y-auto px-2">
          {lists.map((l) => (
            <li key={l.id} className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-2 border-b border-divider py-2 last:border-b-0">
              <span className="flex min-w-0 flex-1 basis-32 flex-col">
                <span title={l.name} className="truncate text-[15px] font-medium text-ink">
                  {l.name}
                </span>
                <span className="text-[13px] text-ink-muted">
                  {l.names.length} {l.names.length === 1 ? "name" : "names"}
                </span>
              </span>
              {confirmingId === l.id ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    autoFocus
                    aria-label={`Confirm delete ${l.name}`}
                    onClick={() => remove(l.id)}
                    className="inline-flex h-10 items-center rounded-full bg-danger px-3.5 text-sm font-semibold text-on-danger"
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmingId(null)} className={pillBtn}>
                    Keep
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Load ${l.name}`}
                    disabled={disabled || busy}
                    onClick={() => void load(l)}
                    className={pillBtn}
                  >
                    Load
                  </button>
                  <button type="button" aria-label={`Delete ${l.name}`} onClick={() => setConfirmingId(l.id)} className={pillBtn}>
                    Delete
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={close} className={secondaryBtn}>
          Close
        </button>
      </div>
    </Modal>
  );
}
