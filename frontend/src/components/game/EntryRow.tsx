import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Palette, Pencil, Trash2 } from "lucide-react";
import type { Entry } from "../../lib/types";

interface Props {
  entry: Entry;
  disabled: boolean;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onToggle: () => void;
  onRemove: () => void;
}

const iconBtn =
  "grid size-9 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white";

export function EntryRow({ entry, disabled, onRename, onColor, onToggle, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);
  useEffect(() => {
    if (disabled) setEditing(false);
  }, [disabled]);

  const commit = () => {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== entry.name) onRename(v);
    else setDraft(entry.name);
  };

  const startEdit = () => {
    setDraft(entry.name);
    setEditing(true);
  };

  return (
    <li
      className={`group flex items-center gap-1.5 rounded-2xl py-1 pr-1 pl-2 transition ${
        entry.is_active ? "hover:bg-slate-50 dark:hover:bg-white/5" : "opacity-55"
      }`}
    >
      <span className="relative shrink-0">
        <button
          type="button"
          aria-label={`Change color for ${entry.name}`}
          disabled={disabled}
          onClick={() => colorRef.current?.click()}
          className="grid size-7 place-items-center rounded-full ring-2 ring-white shadow-sm transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed dark:ring-white/10"
          style={{ backgroundColor: entry.is_active ? entry.color : "#94a3b8" }}
        >
          <Palette className="size-3.5 text-white/90 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
        </button>
        <input
          ref={colorRef}
          type="color"
          tabIndex={-1}
          aria-hidden="true"
          value={entry.color.toLowerCase()}
          disabled={disabled}
          onChange={(e) => onColor(e.target.value.toUpperCase())}
          className="pointer-events-none absolute inset-0 size-7 opacity-0"
        />
      </span>

      {editing ? (
        <input
          ref={inputRef}
          aria-label={`New name for ${entry.name}`}
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(entry.name);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded-xl border border-violet-400 bg-white px-2.5 py-1.5 text-base text-slate-900 outline-none focus:ring-4 focus:ring-violet-500/20 dark:bg-white/5 dark:text-white"
        />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate px-1 text-[15px] font-semibold ${
            entry.is_active ? "text-slate-800 dark:text-slate-100" : "text-slate-500 line-through decoration-slate-400/60 dark:text-slate-400"
          }`}
          onDoubleClick={() => !disabled && startEdit()}
          title={entry.name}
        >
          {entry.name}
        </span>
      )}

      <button type="button" aria-label={`Edit ${entry.name}`} disabled={disabled} onClick={startEdit} className={iconBtn}>
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`${entry.is_active ? "Hide" : "Show"} ${entry.name}`}
        disabled={disabled}
        onClick={onToggle}
        className={iconBtn}
      >
        {entry.is_active ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label={`Remove ${entry.name}`}
        disabled={disabled}
        onClick={onRemove}
        className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-500/15 dark:hover:!text-red-400`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}
