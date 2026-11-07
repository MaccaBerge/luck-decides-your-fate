import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { primaryBtn, textBtn } from "./buttons";

interface Props {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onJoin: (code: string) => void;
}

const CODE_LENGTH = 6;

/** "Join a game": type the code shown on the host's screen. */
export function JoinCodeDialog({ open, busy, error, onClose, onJoin }: Props) {
  const [code, setCode] = useState("");
  const clean = code.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, CODE_LENGTH);

  return (
    <Modal open={open} onClose={onClose} label="Join a game" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-[23px] font-semibold">Join a game</p>
        <p className="text-sm text-ink-muted">Type the code on the host's screen.</p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean.length === CODE_LENGTH && !busy) onJoin(clean);
        }}
      >
        <input
          data-autofocus
          aria-label="Game code"
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABC123"
          className="h-14 rounded-xl border border-border-strong bg-surface px-4 text-center font-display text-[26px] font-semibold tracking-[0.3em] text-ink uppercase outline-none placeholder:text-ink-muted/50 focus:border-primary"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={clean.length !== CODE_LENGTH || busy} className={`${primaryBtn} w-full`}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Join
        </button>
      </form>
      <button type="button" onClick={onClose} className={`${textBtn} self-center`}>
        Cancel
      </button>
    </Modal>
  );
}
