import { useState } from "react";
import type { Entry } from "../../lib/types";
import { EntryRow } from "./EntryRow";
import { Switch } from "./Switch";
import { card, darkBtn, pillBtn } from "./buttons";

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

  return (
    <aside aria-label="Names" className="flex min-w-0 flex-col gap-4">
      <section className={`${card} flex min-h-0 flex-col gap-5 p-6`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[21px] font-semibold text-ink">Names</h2>
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-strong">
            {active.length} on the wheel{inactive.length > 0 ? `, ${inactive.length} hidden` : ""}
          </span>
        </div>

        <form
          className="flex gap-2"
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
            className="h-11 min-w-0 flex-1 rounded-xl border border-border-strong bg-surface-muted px-3.5 text-[15px] text-ink placeholder:text-ink-muted disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Add name"
            disabled={p.disabled || full || !name.trim()}
            // An empty input isn't an error state, so the button keeps its normal look.
            className={`${darkBtn} ${p.disabled || full ? "" : "disabled:opacity-100 disabled:shadow-[0_3px_0_var(--ink-shadow)]"}`}
          >
            Add name
          </button>
        </form>

        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No names yet. Add a few, or paste a whole list.</p>
        ) : (
          // Scrolling clips at the list's edge, so the padding leaves room for row buttons, hover tints and focus rings.
          <ul className="-mx-4 -my-2 flex flex-col overflow-y-auto px-4 md:max-h-[calc(100dvh-29rem)] md:min-h-[150px]">
            {[...active, ...inactive].map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                disabled={p.disabled}
                onRename={(n) => p.onRename(e, n)}
                onColor={(c) => p.onColor(e, c)}
                onToggle={() => p.onToggle(e)}
                onRemove={() => p.onRemove(e)}
              />
            ))}
          </ul>
        )}

        {full && <p className="text-sm text-ink-muted">That's the maximum of {MAX_ENTRIES} names. Remove one to add another.</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={p.onOpenPaste} disabled={p.disabled || full} className={pillBtn}>
            Paste names
          </button>
          <button
            type="button"
            onClick={p.onShuffle}
            disabled={p.disabled || active.length < 2}
            aria-label="Shuffle names"
            className={pillBtn}
          >
            Shuffle names
          </button>
          <button
            type="button"
            onClick={p.onRestore}
            disabled={p.disabled || inactive.length === 0}
            aria-label="Restore all names"
            className={pillBtn}
          >
            Restore all names
          </button>
        </div>
      </section>

      <label className={`${card} flex items-center justify-between gap-4 px-6 py-[18px]`}>
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-ink">Remove winner after spin</span>
          <span className="text-[13px] text-ink-muted">Last one standing loses</span>
        </span>
        <Switch
          label="Remove winner after spin"
          checked={p.removeWinner}
          disabled={p.disabled}
          onChange={p.onRemoveWinnerChange}
        />
      </label>
    </aside>
  );
}
