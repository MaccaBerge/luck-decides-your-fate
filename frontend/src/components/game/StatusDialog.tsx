import { Loader2 } from "lucide-react";
import type { JoinPolicy, MyStatus } from "../../lib/types";
import { Modal } from "./Modal";
import { primaryBtn, secondaryBtn } from "./buttons";

/** Where this browser stands in a game it isn't (or is no longer) playing in. */
export type Standing = { status: Exclude<MyStatus["status"], "player">; request: MyStatus["request"] };

interface Props {
  standing: Standing | null;
  /** The game's code, to name it. */
  code: string | null;
  policy: JoinPolicy;
  busy: boolean;
  /** Ask the host, or come straight back (timed out from an open game). */
  onAsk: () => void;
  /** Accepted: join now. */
  onConfirm: () => void;
  /** Accepted, but not any more. */
  onNoThanks: () => void;
  /** Close; the caller decides where to go. */
  onOk: () => void;
}

interface View {
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
  cancel?: { label: string; onClick: () => void };
}

function view(s: Standing, game: string, policy: JoinPolicy, p: Props): View | null {
  if (s.request === "accepted") {
    return {
      title: "You're accepted!",
      text: `The host said yes. Do you still want to join ${game}?`,
      action: { label: "Join", onClick: p.onConfirm },
      cancel: { label: "No thanks", onClick: p.onNoThanks },
    };
  }
  if (s.request === "declined") return { title: "The host said no", text: `Your request to join ${game} was declined.` };
  if (s.request === "pending") {
    return { title: "Waiting for the host", text: `You asked to join ${game}. You'll see the answer here as soon as the host decides.` };
  }
  if (s.status === "banned") return { title: "You were removed", text: "The host removed you from the game, and you can't join it again." };
  if (s.status === "kicked") {
    return policy === "closed"
      ? { title: "You were removed", text: "The host removed you from the game, and it's closed to new players right now." }
      : { title: "You were removed", text: "The host removed you from the game.", action: { label: "Ask to join again", onClick: p.onAsk } };
  }
  if (s.status === "timed_out") {
    if (policy === "closed") return { title: "You left the game", text: "You were away for too long, and the game is closed to new players now." };
    return {
      title: "You left the game",
      text: "You were away for too long.",
      action: { label: policy === "ask" ? "Ask to join again" : "Join again", onClick: p.onAsk },
    };
  }
  return null;
}

/** Kicked, banned, away too long, waiting for the host, accepted or declined. */
export function StatusDialog(p: Props) {
  if (!p.standing) return null;
  const v = view(p.standing, p.code ? `game ${p.code}` : "the game", p.policy, p);
  if (!v) return null;
  const close = v.cancel ?? { label: "OK", onClick: p.onOk };
  return (
    <Modal open onClose={close.onClick} label={v.title} className="flex flex-col gap-5 text-center">
      <div data-testid="status-dialog" className="flex flex-col gap-1.5">
        <p className="font-display text-[23px] font-semibold">{v.title}</p>
        <p className="text-sm leading-relaxed text-ink-muted">{v.text}</p>
      </div>
      <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
        <button type="button" data-autofocus={v.action ? undefined : true} onClick={close.onClick} className={`${secondaryBtn} !rounded-full px-6`}>
          {close.label}
        </button>
        {v.action && (
          <button type="button" data-autofocus onClick={v.action.onClick} disabled={p.busy} className={primaryBtn}>
            {p.busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {v.action.label}
          </button>
        )}
      </div>
    </Modal>
  );
}
