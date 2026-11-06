import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
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
  "grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-ink/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
// Where a pointer can hover, row actions stay out of the way until they're wanted.
const revealed =
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100";

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
    <li className="group flex min-h-11 items-center gap-1">
      <span className="relative -ml-1 shrink-0">
        <button
          type="button"
          aria-label={`Change color for ${entry.name}`}
          disabled={disabled}
          onClick={() => colorRef.current?.click()}
          className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-ink/10 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <span
            className="size-[18px] rounded-full"
            style={{ backgroundColor: entry.is_active ? entry.color : "var(--line)" }}
          />
        </button>
        <input
          ref={colorRef}
          type="color"
          tabIndex={-1}
          aria-hidden="true"
          value={entry.color.toLowerCase()}
          disabled={disabled}
          onChange={(e) => onColor(e.target.value.toUpperCase())}
          className="pointer-events-none absolute inset-0 size-8 opacity-0"
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
          className="min-w-0 flex-1 rounded-md bg-ink/5 px-1 py-1 text-base font-medium text-ink"
        />
      ) : (
        <button
          type="button"
          aria-label={`Edit ${entry.name}`}
          title={entry.name}
          disabled={disabled}
          onClick={startEdit}
          className={`min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-base font-medium decoration-muted underline-offset-3 enabled:hover:underline disabled:cursor-default ${
            entry.is_active ? "text-ink" : "text-muted"
          }`}
        >
          {entry.name}
        </button>
      )}

      <button
        type="button"
        aria-label={`${entry.is_active ? "Hide" : "Show"} ${entry.name}`}
        disabled={disabled}
        onClick={onToggle}
        className={`${iconBtn} ${entry.is_active ? revealed : ""}`}
      >
        {entry.is_active ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label={`Remove ${entry.name}`}
        disabled={disabled}
        onClick={onRemove}
        className={`${iconBtn} ${revealed} hover:bg-danger/15 hover:text-danger`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}
