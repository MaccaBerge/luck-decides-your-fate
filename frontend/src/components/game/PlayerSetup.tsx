import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AVATARS, randomAvatar } from "../../lib/avatars";
import { primaryBtn } from "./buttons";

interface Props {
  submitLabel: string;
  busy: boolean;
  onSubmit: (name: string, avatar: string) => void;
}

/** Name + avatar, for hosting or joining a multiplayer game. */
export function PlayerSetup({ submitLabel, busy, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(randomAvatar);
  const trimmed = name.trim();

  return (
    <form
      className="flex flex-col gap-5 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed && !busy) onSubmit(trimmed, avatar);
      }}
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink">Your name</span>
        <input
          data-autofocus
          aria-label="Your name"
          value={name}
          maxLength={40}
          autoComplete="nickname"
          placeholder="What should the wheel call you?"
          onChange={(e) => setName(e.target.value)}
          className="h-11 rounded-xl border border-border-strong bg-surface px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-muted focus:border-primary"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-ink">Your avatar</legend>
        <div role="radiogroup" aria-label="Avatar" className="grid grid-cols-8 gap-1.5">
          {AVATARS.map((a) => {
            const checked = a.key === avatar;
            return (
              <button
                key={a.key}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={a.label}
                title={a.label}
                onClick={() => setAvatar(a.key)}
                className={`flex aspect-square items-center justify-center rounded-xl text-[22px] transition-colors ${
                  checked ? "bg-primary-soft shadow-[inset_0_0_0_2px_var(--primary)]" : "hover:bg-surface-tint"
                }`}
              >
                <span aria-hidden="true">{a.emoji}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <button type="submit" disabled={!trimmed || busy} className={`${primaryBtn} w-full`}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </button>
    </form>
  );
}
