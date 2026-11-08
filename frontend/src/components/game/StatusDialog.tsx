import type { ReactNode } from "react";
import { Ban, Clock, Hourglass, Loader2, PartyPopper, UserX } from "lucide-react";
import type { JoinPolicy, MyStatus } from "../../lib/types";
import { Modal } from "./Modal";
import { card, primaryBtn, secondaryBtn } from "./buttons";

/** Where this browser stands in a game it isn't (or is no longer) playing in. */
export type Standing = { status: Exclude<MyStatus["status"], "player">; request: MyStatus["request"]; invited?: boolean };

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
  /** A card on the page itself (no wheel behind it) instead of a dialog. */
  inline?: boolean;
}

interface View {
  title: string;
  text: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  cancel?: { label: string; onClick: () => void };
  tone?: "danger";
}

function view(s: Standing, game: string, policy: JoinPolicy, p: Props): View | null {
  if (s.request === "accepted") {
    return {
      title: s.invited ? "You're invited back!" : "You're accepted!",
      text: s.invited
        ? `The host invited you back to ${game}. Do you want to join?`
        : `The host said yes. Do you still want to join ${game}?`,
      icon: <PartyPopper className="size-7 text-primary-strong" aria-hidden="true" />,
      action: { label: "Join", onClick: p.onConfirm },
      cancel: { label: "No thanks", onClick: p.onNoThanks },
    };
  }
  if (s.request === "declined") return { title: "The host said no", text: `Your request to join ${game} was declined.` };
  if (s.request === "pending") {
    return {
      title: "Waiting for the host",
      text: `You asked to join ${game}. You'll see the answer here as soon as the host decides.`,
      icon: <Hourglass className="size-7 text-ink-muted" aria-hidden="true" />,
    };
  }
  if (s.status === "banned") {
    return {
      title: "You were banned",
      text: "The host banned you from this game, so you can't join it again.",
      icon: <Ban className="size-7 text-danger" aria-hidden="true" />,
      tone: "danger",
    };
  }
  if (s.status === "kicked") {
    const icon = <UserX className="size-7 text-ink-muted" aria-hidden="true" />;
    return policy === "closed"
      ? { title: "You were kicked", text: "The host kicked you from the game, and it's closed to new players right now.", icon }
      : {
          title: "You were kicked",
          text: "The host kicked you from the game. You can ask to join again.",
          icon,
          action: { label: "Ask to join again", onClick: p.onAsk },
        };
  }
  if (s.status === "timed_out") {
    const icon = <Clock className="size-7 text-ink-muted" aria-hidden="true" />;
    if (policy === "closed") return { title: "You left the game", text: "You were away for too long, and the game is closed to new players now.", icon };
    return {
      title: "You left the game",
      text: "You were away for too long.",
      icon,
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
  const body = (
    <>
      <div data-testid="status-dialog" data-tone={v.tone ?? "neutral"} className="flex flex-col items-center gap-1.5">
        {v.icon && (
          <span
            className={`mb-2 flex size-14 items-center justify-center rounded-full ${v.tone === "danger" ? "bg-danger/10" : "bg-surface-tint"}`}
          >
            {v.icon}
          </span>
        )}
        <p className={`font-display text-[23px] font-semibold ${v.tone === "danger" ? "text-danger" : ""}`}>{v.title}</p>
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
    </>
  );
  if (p.inline) {
    return (
      <section aria-label={v.title} className={`${card} mx-auto flex w-full max-w-md flex-col gap-5 p-7 text-center`}>
        {body}
      </section>
    );
  }
  return (
    <Modal open onClose={close.onClick} label={v.title} className="flex flex-col gap-5 text-center">
      {body}
    </Modal>
  );
}
