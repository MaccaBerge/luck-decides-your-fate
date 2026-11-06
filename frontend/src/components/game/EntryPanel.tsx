import { useState } from "react";
import { ClipboardList, Plus, Shuffle } from "lucide-react";
import type { Entry } from "../../lib/types";
import { EntryRow } from "./EntryRow";
import { Switch } from "./Switch";
import { quietBtn } from "./buttons";

interface Props {
  entries: Entry[];
  removeWinner: boolean;
  disabled: boolean;
  onAdd: (names: string[]) => Promise<boolean>;
  onOpenPaste: () => void;
  onRename: (e: Entry, name: string) => void;
  onColor: (e: Entry, color: string) => void;
  onToggle: (e: Entry) => void;
  onRemove: (e: Entry) => void;
  onShuffle: () => void;
  onRestore: () => void;
  onRemoveWinnerChange: (v: boolean) => void;
}

const MAX_ENTRIES = 100;

export function EntryPanel(p: Props) {
  const [name, setName] = useState("");
  const sorted = [...p.entries].sort((a, b) => a.position - b.position);
  const active = sorted.filter((e) => e.is_active);
  const inactive = sorted.filter((e) => !e.is_active);
  const full = p.entries.length >= MAX_ENTRIES;

  const add = async () => {
    const v = name.trim();
    if (!v) return;
    const ok = await p.onAdd([v]);
    if (ok) setName("");
  };

  const row = (e: Entry) => (
    <EntryRow
      key={e.id}
      entry={e}
      disabled={p.disabled}
      onRename={(n) => p.onRename(e, n)}
      onColor={(c) => p.onColor(e, c)}
      onToggle={() => p.onToggle(e)}
      onRemove={() => p.onRemove(e)}
    />
  );

  return (
    <section
      aria-label="Names"
      className="flex min-h-0 flex-col rounded-md bg-pad px-4 pt-4 pb-2 shadow-[0_2px_6px_rgb(0_0_0/0.12)] sm:px-5 sm:pt-5 md:max-h-[calc(100dvh-7rem)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold text-ink">Names</h2>
        <span className="text-sm text-muted">
          {active.length} on the wheel{inactive.length > 0 ? `, ${inactive.length} hidden` : ""}
        </span>
      </div>

      <form
        className="mt-3 flex items-center gap-2 border-b-2 border-ink"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          aria-label="New name"
          placeholder="Add a name"
          value={name}
          maxLength={40}
          disabled={p.disabled || full}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-lg text-ink placeholder:text-muted focus-visible:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Add name"
          disabled={p.disabled || full || !name.trim()}
          className="mb-1 grid size-9 shrink-0 place-items-center rounded-lg bg-brass text-on-brass transition-opacity hover:brightness-105 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-muted"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No names yet. Add a few, or paste a whole list.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">{active.map(row)}</ul>
            {inactive.length > 0 && (
              <>
                <div className="mt-3 flex items-center justify-between gap-3 border-b border-line pb-1">
                  <h3 className="text-sm font-semibold text-muted">Hidden</h3>
                  <button
                    type="button"
                    onClick={p.onRestore}
                    disabled={p.disabled}
                    aria-label="Restore all names"
                    className="rounded-md px-2 py-1 text-sm font-semibold text-ink underline decoration-line underline-offset-3 hover:decoration-ink disabled:text-muted"
                  >
                    Restore all
                  </button>
                </div>
                <ul className="divide-y divide-line">{inactive.map(row)}</ul>
              </>
            )}
          </>
        )}
      </div>

      {full && <p className="mt-2 text-sm text-muted">That's the maximum of {MAX_ENTRIES} names. Remove one to add another.</p>}

      <div className="mt-1 border-t-2 border-ink pt-1.5">
        <div className="-mx-3 flex flex-wrap gap-x-1">
        <button type="button" onClick={p.onOpenPaste} disabled={p.disabled || full} className={quietBtn}>
          <ClipboardList className="size-4" aria-hidden="true" />
          Paste names
        </button>
        <button
          type="button"
          onClick={p.onShuffle}
          disabled={p.disabled || active.length < 2}
          aria-label="Shuffle names"
          className={quietBtn}
        >
          <Shuffle className="size-4" aria-hidden="true" />
          Shuffle
        </button>
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 py-2">
        <span className="text-sm font-semibold text-ink">Remove winner after spin</span>
        <Switch
          label="Remove winner after spin"
          checked={p.removeWinner}
          disabled={p.disabled}
          onChange={p.onRemoveWinnerChange}
        />
      </label>
    </section>
  );
}
