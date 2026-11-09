import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { Entry } from "../../lib/types";
import type { LinkSummary, RuleStatus } from "../adminTypes";
import { btnPill, btnSecondary, fieldLabel, input } from "./ui";

/** "Every spin" is sent as null. */
export const CHANCES: (number | null)[] = [null, 75, 50, 25, 10];
/** "Off" is sent as null. */
export const STREAKS: (number | null)[] = [null, 2, 3, 4, 5];

function Choices<T>({
  label,
  name,
  options,
  value,
  text,
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  options: T[];
  value: T;
  text: (v: T) => string;
  disabled: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={on}
            name={name}
            disabled={disabled}
            onClick={() => !on && onChange(o)}
            className={`h-9 rounded-full px-3.5 text-sm font-medium transition-colors disabled:opacity-60 ${
              on ? "bg-ink text-surface" : "border border-border-strong bg-surface text-ink hover:bg-surface-muted"
            }`}
          >
            {text(o)}
          </button>
        );
      })}
    </div>
  );
}

/** Chance and the streak breaker, for the "always" mode. */
export function AlwaysOptions({
  link,
  activeCount,
  onPatch,
}: {
  /** A link, a wheel, or the standing rule (id is only used to name the controls). */
  link: Pick<LinkSummary, "id" | "chance" | "max_streak">;
  activeCount: number;
  onPatch: (body: { chance?: number | null; max_streak?: number | null }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (body: { chance?: number | null; max_streak?: number | null }) => {
    setBusy(true);
    await onPatch(body);
    setBusy(false);
  };
  const fair = activeCount > 0 ? Math.round(100 / activeCount) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <span className={fieldLabel}>How often the target wins</span>
        <Choices
          label="How often the target wins"
          name={`chance-${link.id}`}
          options={CHANCES}
          value={link.chance}
          text={(c) => (c === null ? "Every spin" : `${c}%`)}
          disabled={busy}
          onChange={(chance) => void run({ chance })}
        />
        {fair !== null && <span className="text-[13px] text-ink-muted">A fair share is about {fair}%. Less than every spin is harder to notice.</span>}
      </div>
      <div className="flex flex-col gap-2.5">
        <span className={fieldLabel}>Streak breaker: pause after this many wins in a row</span>
        <Choices
          label="Streak breaker"
          name={`streak-${link.id}`}
          options={STREAKS}
          value={link.max_streak}
          text={(s) => (s === null ? "Off" : String(s))}
          disabled={busy}
          onChange={(max_streak) => void run({ max_streak })}
        />
      </div>
    </div>
  );
}

/**
 * The script: who wins the next spins, in order. A step is used up by the spin it decides; one
 * whose name isn't on the wheel waits, and the rule decides meanwhile.
 */
export function ScriptCard({
  link,
  status,
  entries,
  onSave,
  className,
}: {
  link: LinkSummary;
  status: RuleStatus;
  entries: Entry[];
  onSave: (script: string[]) => Promise<void>;
  className: string;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const save = async (script: string[]) => {
    setBusy(true);
    await onSave(script);
    setBusy(false);
  };
  const add = async (n: string) => {
    const t = n.trim();
    if (!t || link.script.length >= 20) return;
    await save([...link.script, t]);
    setName("");
  };
  const waiting = status.script_step !== null && status.script_step.entry_ids.length === 0;
  const active = entries.filter((e) => e.is_active);

  return (
    <section aria-label="Script" className={`${className} flex min-w-0 flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Next winners</h2>
        {link.script.length > 0 && (
          <button type="button" className={btnSecondary} disabled={busy} onClick={() => void save([])}>
            Clear
          </button>
        )}
      </div>
      <p className="text-sm text-ink-muted">
        These win the next spins, in order, before the rule. Each one is used up by its spin.
      </p>
      {link.script.length > 0 && (
        <ol data-testid="script" className="flex flex-col gap-1.5">
          {link.script.map((step, i) => (
            <li key={`${i}-${step}`} className="flex items-center gap-3 rounded-xl bg-surface-tint py-1.5 pr-1.5 pl-3 text-sm">
              <span className="w-12 shrink-0 text-xs font-semibold text-ink-muted">{i === 0 ? "Next" : `#${i + 1}`}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{step}</span>
              {i === 0 && waiting && <span className="shrink-0 text-xs text-warn-ink">not on the wheel</span>}
              <button
                type="button"
                aria-label={`Remove ${step} from the script`}
                disabled={busy}
                onClick={() => void save(link.script.filter((_, j) => j !== i))}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Add a name from the wheel">
          {active.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`${btnPill} !h-9`}
              disabled={busy || link.script.length >= 20}
              onClick={() => void add(e.name)}
              aria-label={`${e.name} wins ${link.script.length === 0 ? "the next spin" : "after that"}`}
            >
              <Plus className="size-3.5" aria-hidden />
              {e.name}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          void add(name);
        }}
      >
        <input
          aria-label="Add a name to the script"
          className={input}
          maxLength={40}
          placeholder="A name not on the wheel yet"
          value={name}
          onChange={(ev) => setName(ev.target.value)}
        />
        <button type="submit" className={`${btnSecondary} shrink-0`} disabled={busy || !name.trim() || link.script.length >= 20}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Add"}
        </button>
      </form>
    </section>
  );
}
