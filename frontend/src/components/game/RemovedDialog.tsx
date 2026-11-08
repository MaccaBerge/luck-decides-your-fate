import { Loader2 } from "lucide-react";
import type { MyStatus } from "../../lib/types";
import { Modal } from "./Modal";
import { primaryBtn, secondaryBtn } from "./buttons";

export type Removal = Pick<MyStatus, "request"> & { status: "kicked" | "banned" | "timed_out" };

interface Props {
  removal: Removal | null;
  locked: boolean;
  busy: boolean;
  onAsk: () => void;
  onRejoin: () => void;
  onOk: () => void;
}

/** What a removed player sees: kicked (can ask to join again), banned, or away too long. */
export function RemovedDialog({ removal, locked, busy, onAsk, onRejoin, onOk }: Props) {
  if (!removal) return null;
  const { status, request } = removal;
  const title =
    status === "timed_out"
      ? "You left the game"
      : request === "pending"
        ? "Waiting for the host"
        : request === "declined"
          ? "The host said no"
          : "You were removed";
  const text =
    status === "timed_out"
      ? locked
        ? "You were away for too long, and the game is locked now."
        : "You were away for too long."
      : status === "banned"
        ? "The host removed you from the game, and you can't join it again."
        : request === "pending"
          ? "You asked to join again. You'll be back in as soon as the host says yes."
          : request === "declined"
            ? "You can't join this game again."
            : "The host removed you from the game.";
  const action =
    status === "kicked" && request === null
      ? { label: "Ask to join again", onClick: onAsk }
      : status === "timed_out" && !locked
        ? { label: "Join again", onClick: onRejoin }
        : null;

  return (
    <Modal open onClose={onOk} label={title} className="flex flex-col gap-5 text-center">
      <div data-testid="removed-dialog" className="flex flex-col gap-1.5">
        <p className="font-display text-[23px] font-semibold">{title}</p>
        <p className="text-sm leading-relaxed text-ink-muted">{text}</p>
      </div>
      <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
        <button type="button" data-autofocus={action ? undefined : true} onClick={onOk} className={`${secondaryBtn} !rounded-full px-6`}>
          OK
        </button>
        {action && (
          <button type="button" data-autofocus onClick={action.onClick} disabled={busy} className={primaryBtn}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {action.label}
          </button>
        )}
      </div>
    </Modal>
  );
}
