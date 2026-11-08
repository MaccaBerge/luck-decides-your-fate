import { Modal } from "./Modal";
import { primaryBtn } from "./buttons";

/** A short message with one OK button. */
export function NoticeDialog({ open, title, text, onClose }: { open: boolean; title: string; text: string; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label={title} className="flex flex-col gap-5 text-center">
      <div data-testid="notice-dialog" className="flex flex-col gap-1.5">
        <p className="font-display text-[23px] font-semibold">{title}</p>
        <p className="text-sm leading-relaxed text-ink-muted">{text}</p>
      </div>
      <button type="button" data-autofocus onClick={onClose} className={`${primaryBtn} self-center px-8`}>
        OK
      </button>
    </Modal>
  );
}
