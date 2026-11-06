import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import type { Entry } from "../../lib/types";
import { iconBtn } from "./buttons";

interface Props {
  entry: Entry;
  disabled: boolean;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onToggle: () => void;
  onRemove: () => void;
}

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
    <li className="flex min-h-[50px] shrink-0 items-center border-b border-divider last:border-b-0">
      <span className="relative -ml-3.5 shrink-0">
        <button
          type="button"
          aria-label={`Change color for ${entry.name}`}
          disabled={disabled}
          onClick={() => colorRef.current?.click()}
          className="grid size-11 place-items-center rounded-xl transition-colors enabled:hover:bg-surface-tint disabled:cursor-not-allowed"
        >
          <span
            className={`size-3.5 rounded-full ${entry.is_active ? "" : "opacity-40 grayscale"}`}
            style={{ backgroundColor: entry.color }}
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
          className="pointer-events-none absolute inset-0 size-11 opacity-0"
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
          className="h-9 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface-muted px-2 text-[15px] font-medium text-ink"
        />
      ) : (
        <button
          type="button"
          aria-label={`Edit ${entry.name}`}
          title={entry.name}
          disabled={disabled}
          onClick={startEdit}
          className={`h-11 min-w-0 flex-1 truncate rounded-lg text-left text-[15px] font-medium decoration-ink-muted underline-offset-3 enabled:hover:underline disabled:cursor-default ${
            entry.is_active ? "text-ink" : "text-ink-muted line-through"
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
        className={iconBtn}
      >
        {entry.is_active ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label={`Remove ${entry.name}`}
        disabled={disabled}
        onClick={onRemove}
        className={`${iconBtn} -mr-3`}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}
