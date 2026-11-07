import { avatarEmoji } from "../../lib/avatars";
import type { Player } from "../../lib/types";
import { PlayerSetup } from "./PlayerSetup";
import { card, textBtn } from "./buttons";

interface Props {
  players: Player[];
  busy: boolean;
  onJoin: (name: string, avatar: string) => void;
  onWatch: () => void;
}

/** What someone who hasn't joined a multiplayer game sees first. */
export function JoinScreen({ players, busy, onJoin, onWatch }: Props) {
  const host = players.find((p) => p.is_host);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4">
      <section aria-label="Join" className={`${card} flex flex-col gap-5 p-7`}>
        <div className="flex flex-col gap-1.5">
          <p className="font-display text-[26px] leading-tight font-semibold">Join the game</p>
          <p className="text-sm leading-relaxed text-ink-muted">
            {host ? `${host.name} is hosting. ` : ""}Pick a name and an avatar, and you'll get a slice on the wheel.
          </p>
        </div>
        {players.length > 0 && (
          <p className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
            <span aria-hidden="true" className="text-[18px]">
              {players.slice(0, 8).map((p) => avatarEmoji(p.avatar)).join(" ")}
            </span>
            <span>
              {players.length} {players.length === 1 ? "player has" : "players have"} joined
            </span>
          </p>
        )}
        <PlayerSetup submitLabel="Join" busy={busy} onSubmit={onJoin} />
      </section>
      <button type="button" onClick={onWatch} className={`${textBtn} self-center`}>
        Just watch
      </button>
    </main>
  );
}
