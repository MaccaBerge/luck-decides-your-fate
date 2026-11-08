import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { avatarEmoji, avatarLabel } from "../../lib/avatars";
import type { JoinRequest } from "../../lib/types";
import { pillBtn } from "./buttons";

interface Props {
  requests: JoinRequest[];
  busy: boolean;
  onAnswer: (r: JoinRequest, accept: boolean) => void;
}

/** For the host: one compact line ("2 players want to join") that expands into the list. */
export function JoinRequests({ requests, busy, onAnswer }: Props) {
  const [open, setOpen] = useState(false);
  if (requests.length === 0) return null;
  const pending = requests.filter((r) => r.state === "pending").length;
  const summary =
    pending > 0
      ? `${pending} ${pending === 1 ? "player wants" : "players want"} to join`
      : `Waiting for ${requests.length === 1 ? requests[0].name : `${requests.length} players`} to join`;

  return (
    <section data-testid="join-requests" className="w-full max-w-[560px] rounded-2xl border border-primary/30 bg-primary-soft text-sm text-primary-soft-ink">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left font-semibold"
      >
        <span className="flex-1">{summary}</span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="flex flex-col border-t border-primary/20 px-2 py-1">
          {requests.map((r) => (
            <li key={r.player_id} className="flex min-h-12 items-center gap-3 px-2 py-1.5">
              <span role="img" aria-label={avatarLabel(r.avatar)} className="text-[18px]">
                {avatarEmoji(r.avatar)}
              </span>
              <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{r.name}</span>
              {r.state === "accepted" ? (
                <span className="text-[13px] opacity-80">Accepted, waiting for {r.name}</span>
              ) : (
                <>
                  <button type="button" onClick={() => onAnswer(r, false)} disabled={busy} className={`${pillBtn} h-9`}>
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => onAnswer(r, true)}
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-full bg-primary px-4 font-semibold text-white disabled:opacity-60"
                  >
                    Accept
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
