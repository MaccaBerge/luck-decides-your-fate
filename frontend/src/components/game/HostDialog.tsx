import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { PlayerSetup } from "./PlayerSetup";
import { textBtn } from "./buttons";

/** "keep": host this wheel with its names. "fresh": host a new, empty wheel; this one stays as it is. */
export type HostChoice = "keep" | "fresh";

interface Props {
  open: boolean;
  busy: boolean;
  /** Names on the wheel now; with none, there's nothing to keep and no question is asked. */
  names: string[];
  onClose: () => void;
  onHost: (name: string, avatar: string, choice: HostChoice) => void;
}

function namesSummary(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

/** "Host this wheel": turns a wheel into a multiplayer game, with you as the host. */
export function HostDialog({ open, busy, names, onClose, onHost }: Props) {
  const [choice, setChoice] = useState<HostChoice | null>(null);
  const ask = names.length > 0;

  useEffect(() => {
    if (open) setChoice(null);
  }, [open]);

  const options: { value: HostChoice; title: string; detail: string }[] = [
    {
      value: "keep",
      title: "Keep these names",
      detail: `${namesSummary(names)} ${names.length === 1 ? "stays" : "stay"} on the wheel, and players are added to ${names.length === 1 ? "it" : "them"}.`,
    },
    { value: "fresh", title: "Start fresh", detail: "Host a new, empty wheel. This one stays as it is." },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Host this wheel"
      // Tall with the names question: scroll inside the screen rather than run off it.
      className="flex max-h-[calc(100dvh-2rem)] flex-col gap-5 overflow-y-auto"
    >
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-[23px] font-semibold">Play together</p>
        <p className="text-sm leading-relaxed text-ink-muted">
          Friends join from their own phones with a code, and each of them gets a slice on the wheel. You spin.
        </p>
      </div>
      {ask && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-ink">
            This wheel has {names.length} {names.length === 1 ? "name" : "names"}. What should the game start with?
          </legend>
          <div role="radiogroup" aria-label="Names to start with" className="flex flex-col gap-2">
            {options.map((o) => {
              const checked = choice === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setChoice(o.value)}
                  className={`flex flex-col gap-0.5 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    checked
                      ? "border-primary bg-primary-soft text-primary-soft-ink"
                      : "border-border-strong bg-surface text-ink hover:bg-surface-muted"
                  }`}
                >
                  <span className="text-[15px] font-semibold">{o.title}</span>
                  <span className={`text-sm ${checked ? "" : "text-ink-muted"} [overflow-wrap:anywhere]`}>{o.detail}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <PlayerSetup
        submitLabel="Host this wheel"
        busy={busy}
        ready={!ask || choice !== null}
        onSubmit={(name, avatar) => onHost(name, avatar, ask ? (choice ?? "keep") : "keep")}
      />
      <button type="button" onClick={onClose} className={`${textBtn} self-center`}>
        Cancel
      </button>
    </Modal>
  );
}
