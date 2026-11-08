import { avatarEmoji, avatarLabel } from "../../lib/avatars";
import type { JoinRequest } from "../../lib/types";
import { pillBtn } from "./buttons";

interface Props {
  requests: JoinRequest[];
  busy: boolean;
  onAnswer: (r: JoinRequest, accept: boolean) => void;
}

/** For the host: kicked players asking to join again. */
export function JoinRequests({ requests, busy, onAnswer }: Props) {
  if (requests.length === 0) return null;
  return (
    <ul data-testid="join-requests" className="flex w-full max-w-[560px] flex-col gap-2">
      {requests.map((r) => (
        <li key={r.player_id} className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft py-2 pr-2 pl-3 text-sm text-primary-soft-ink">
          <span role="img" aria-label={avatarLabel(r.avatar)} className="text-[18px]">
            {avatarEmoji(r.avatar)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-semibold [overflow-wrap:anywhere]">{r.name}</span> wants to join again
          </span>
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
        </li>
      ))}
    </ul>
  );
}
