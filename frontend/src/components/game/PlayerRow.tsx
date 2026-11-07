import { Crown, LogOut, X } from "lucide-react";
import type { Player } from "../../lib/types";
import { avatarEmoji, avatarLabel } from "../../lib/avatars";
import { pillBtn } from "./buttons";

interface Props {
  players: Player[];
  /** This browser's player, if it has joined. */
  meId: string | null;
  isHost: boolean;
  busy: boolean;
  onLeave: () => void;
  onJoin: () => void;
  onRemove: (p: Player) => void;
}

/** Who's in the game: avatar, name, host crown; greyed out while away. */
export function PlayerRow({ players, meId, isHost, busy, onLeave, onJoin, onRemove }: Props) {
  const here = players.filter((p) => p.status === "here").length;
  return (
    <div data-testid="player-row" className="flex w-full max-w-[560px] flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">
            {players.length} {players.length === 1 ? "player" : "players"}
          </span>
          {players.length > 0 && `, ${here} here`}
        </p>
        {meId ? (
          <button type="button" onClick={onLeave} disabled={busy} className={`${pillBtn} h-9`}>
            <LogOut className="size-4" aria-hidden="true" />
            Leave
          </button>
        ) : (
          <button type="button" onClick={onJoin} className={`${pillBtn} h-9`}>
            Join
          </button>
        )}
      </div>
      {players.length === 0 ? (
        <p className="text-sm text-ink-muted">Nobody has joined yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {players.map((p) => {
            const away = p.status === "away";
            const me = p.id === meId;
            return (
              <li
                key={p.id}
                data-testid={`player-${p.id}`}
                className={`flex h-10 max-w-full items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-1 text-sm ${
                  me ? "border-primary bg-primary-soft text-primary-soft-ink" : "border-border bg-surface-muted text-ink"
                } ${away ? "opacity-55" : ""}`}
                title={`${p.name}${p.is_host ? " (host)" : ""}${away ? ", away" : ""}`}
              >
                <span
                  role="img"
                  aria-label={avatarLabel(p.avatar)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-[18px]"
                >
                  {avatarEmoji(p.avatar)}
                </span>
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                {me && <span className="shrink-0 text-xs font-semibold">(you)</span>}
                {p.is_host && (
                  <span data-testid="host-badge" className="flex shrink-0 items-center" title="Host">
                    <Crown className="size-4 text-primary-strong" aria-hidden="true" />
                    <span className="sr-only">, host</span>
                  </span>
                )}
                {away && <span className="sr-only">, away</span>}
                {isHost && !me ? (
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => onRemove(p)}
                    disabled={busy}
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-tint hover:text-ink disabled:opacity-40"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="w-1" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
