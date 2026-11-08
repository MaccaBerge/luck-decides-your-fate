import { Modal } from "./Modal";
import { dangerBtn, secondaryBtn, textBtn } from "./buttons";

interface Props {
  /** The player being removed; null keeps the dialog closed. */
  name: string | null;
  busy: boolean;
  onKick: () => void;
  onBan: () => void;
  onClose: () => void;
}

/** The host removes a player: kick (they can ask to join again) or ban (they can't come back). */
export function KickDialog({ name, busy, onKick, onBan, onClose }: Props) {
  return (
    <Modal open={name !== null} onClose={onClose} label={`Remove ${name ?? ""}`} className="flex flex-col gap-5 text-center">
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-[23px] font-semibold [overflow-wrap:anywhere]">Remove {name}?</p>
        <p className="text-sm leading-relaxed text-ink-muted">
          Kicked players can ask to join again. Banned players can't come back.
        </p>
      </div>
      <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
        <button type="button" data-autofocus onClick={onKick} disabled={busy} className={`${secondaryBtn} !rounded-full px-6`}>
          Kick
        </button>
        <button type="button" onClick={onBan} disabled={busy} className={dangerBtn}>
          Ban
        </button>
      </div>
      <button type="button" onClick={onClose} className={`${textBtn} self-center`}>
        Cancel
      </button>
    </Modal>
  );
}
