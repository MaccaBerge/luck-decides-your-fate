import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { dangerBtn, primaryBtn, secondaryBtn } from "./buttons";

interface Props {
  open: boolean;
  title: string;
  /** One short line, or nothing. */
  message?: string | null;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  /** Show the confirm button in the danger colour (a risky action). */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** "Are you sure?" */
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel = "Cancel", busy = false, danger = false, onConfirm, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} label={title} className="flex flex-col gap-5 text-center">
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-[23px] font-semibold">{title}</p>
        {message && <p className="text-sm leading-relaxed text-ink-muted">{message}</p>}
      </div>
      <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
        <button type="button" data-autofocus onClick={onClose} className={`${secondaryBtn} !rounded-full px-6`}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={danger ? dangerBtn : primaryBtn}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
