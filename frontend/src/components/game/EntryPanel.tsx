import { useState } from "react";
import { ClipboardList, Plus, RotateCcw, Shuffle } from "lucide-react";
import type { Entry } from "../../lib/types";
import { EntryRow } from "./EntryRow";
import { Switch } from "./Switch";

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

const toolBtn =
  "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-violet-400/50 dark:hover:text-violet-300";

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
      className="flex min-h-0 flex-col rounded-[28px] bg-white/80 p-4 shadow-xl shadow-violet-900/5 ring-1 ring-black/5 backdrop-blur sm:p-5 dark:bg-white/[0.04] dark:shadow-black/30 dark:ring-white/10"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Names</h2>
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          {active.length} on the wheel{inactive.length > 0 ? ` · ${inactive.length} hidden` : ""}
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
          placeholder="Add a name…"
          value={name}
          maxLength={40}
          disabled={p.disabled || full}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <button
          type="submit"
          aria-label="Add name"
          disabled={p.disabled || full || !name.trim()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-violet-600 text-white shadow-md shadow-violet-500/30 transition hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={p.onOpenPaste} disabled={p.disabled || full} className={toolBtn}>
          <ClipboardList className="size-4" aria-hidden="true" />
          Paste names
        </button>
        <button
          type="button"
          onClick={p.onShuffle}
          disabled={p.disabled || active.length < 2}
          aria-label="Shuffle names"
          className={toolBtn}
        >
          <Shuffle className="size-4" aria-hidden="true" />
          Shuffle
        </button>
        <button
          type="button"
          onClick={p.onRestore}
          disabled={p.disabled || inactive.length === 0}
          aria-label="Restore all names"
          className={toolBtn}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Restore all
        </button>
      </div>

      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/5">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Remove winner after spin</span>
        <Switch
          label="Remove winner after spin"
          checked={p.removeWinner}
          disabled={p.disabled}
          onChange={p.onRemoveWinnerChange}
        />
      </label>

      <div className="mt-3 -mr-1 min-h-0 flex-1 overflow-y-auto pr-1 md:max-h-[calc(100vh-24rem)]">
        {sorted.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
            No names yet. Add a few, or paste a whole list.
          </div>
        ) : (
          <>
            <ul className="space-y-0.5">{active.map(row)}</ul>
            {inactive.length > 0 && (
              <>
                <p className="mt-4 mb-1 px-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Hidden</p>
                <ul className="space-y-0.5">{inactive.map(row)}</ul>
              </>
            )}
          </>
        )}
      </div>
      {full && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">That's the max of {MAX_ENTRIES} names.</p>
      )}
    </section>
  );
}
