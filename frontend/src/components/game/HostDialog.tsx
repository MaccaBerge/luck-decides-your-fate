import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { PlayerSetup } from "./PlayerSetup";
import { InfoTip } from "./InfoTip";
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

/** "Host this wheel": turns a wheel into a multiplayer game, with you as the host. */
export function HostDialog({ open, busy, names, onClose, onHost }: Props) {
  const [choice, setChoice] = useState<HostChoice | null>(null);
  const ask = names.length > 0;

  useEffect(() => {
    if (open) setChoice(null);
  }, [open]);

  const options: { value: HostChoice; label: string }[] = [
    { value: "keep", label: "Keep names from current wheel" },
    { value: "fresh", label: "Create new wheel" },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Host this wheel"
      // Tall with the names question: scroll inside the screen rather than run off it.
      className="flex max-h-[calc(100dvh-2rem)] flex-col gap-5 overflow-y-auto"
    >
      <div className="flex items-center gap-1">
        <p className="font-display text-[23px] font-semibold">Play together</p>
        <InfoTip label="About playing together">
          Friends join from their own phones with a code, and each of them gets a slice on the wheel. You spin.
        </InfoTip>
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
                  className={`flex min-h-12 items-center rounded-2xl border px-4 py-3 text-left text-[15px] font-semibold transition-colors ${
                    checked
                      ? "border-primary bg-primary-soft text-primary-soft-ink"
                      : "border-border-strong bg-surface text-ink hover:bg-surface-muted"
                  }`}
                >
                  {o.label}
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
