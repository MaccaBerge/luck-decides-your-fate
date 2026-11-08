import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { avatarEmoji, avatarLabel } from "../../lib/avatars";
import type { RemovedPlayer } from "../../lib/types";
import { pillBtn } from "./buttons";

interface Props {
  removed: RemovedPlayer[];
  busy: boolean;
  onInvite: (p: RemovedPlayer) => void;
  onUnban: (p: RemovedPlayer) => void;
}

/** For the host: kicked and banned players, collapsed into one line, with "Invite back" and "Unban". */
export function RemovedPlayers({ removed, busy, onInvite, onUnban }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (removed.length === 0) setOpen(false);
  }, [removed.length]);
  if (removed.length === 0) return null;

  return (
    <section data-testid="removed-players" className="w-full max-w-[560px] rounded-2xl border border-border bg-surface-muted text-sm text-ink">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left font-semibold"
      >
        <span className="flex-1">
          {removed.length} removed {removed.length === 1 ? "player" : "players"}
        </span>
        <ChevronDown className={`size-4 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="flex flex-col border-t border-border px-2 py-1">
          {removed.map((p) => (
            <li key={p.player_id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
              <span role="img" aria-label={avatarLabel(p.avatar)} className="text-[18px]">
                {avatarEmoji(p.avatar)}
              </span>
              <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{p.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  p.invited
                    ? "bg-primary-soft text-primary-soft-ink"
                    : p.reason === "banned"
                      ? "bg-danger/10 text-danger"
                      : "bg-surface-tint text-ink-muted"
                }`}
              >
                {p.invited ? "Invited back" : p.reason === "banned" ? "Banned" : "Kicked"}
              </span>
              {p.reason === "banned" && !p.invited && (
                <button type="button" onClick={() => onUnban(p)} disabled={busy} className={`${pillBtn} h-9`}>
                  Unban
                </button>
              )}
              {!p.invited && (
                <button
                  type="button"
                  onClick={() => onInvite(p)}
                  disabled={busy}
                  className="inline-flex h-9 items-center rounded-full bg-primary px-4 font-semibold text-white disabled:opacity-60"
                >
                  Invite back
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
