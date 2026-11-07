import { Modal } from "./Modal";
import { PlayerSetup } from "./PlayerSetup";
import { textBtn } from "./buttons";

interface Props {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onHost: (name: string, avatar: string) => void;
}

/** "Host this wheel": turns this wheel into a multiplayer game, with you as the host. */
export function HostDialog({ open, busy, onClose, onHost }: Props) {
  return (
    <Modal open={open} onClose={onClose} label="Host this wheel" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-[23px] font-semibold">Play together</p>
        <p className="text-sm leading-relaxed text-ink-muted">
          Friends join from their own phones with a code, and each of them gets a slice on the wheel. You spin.
        </p>
      </div>
      <PlayerSetup submitLabel="Host this wheel" busy={busy} onSubmit={onHost} />
      <button type="button" onClick={onClose} className={`${textBtn} self-center`}>
        Cancel
      </button>
    </Modal>
  );
}
