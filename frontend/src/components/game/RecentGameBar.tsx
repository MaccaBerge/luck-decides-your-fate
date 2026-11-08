import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, X } from "lucide-react";
import { ApiError, findGameByCode, myStatus } from "../../lib/api";
import { getMe } from "../../lib/players";
import { clearRecentGame, getRecentGame, type RecentGame } from "../../lib/recentGame";

/**
 * A bar at the top of the wheel page: "You're still in game ABC123 / Back to game", or after
 * leaving "Game ABC123 is still going / Join again". Shown only while that game exists and has
 * players, and not on the game itself.
 */
export function RecentGameBar({ currentGameId }: { currentGameId: string }) {
  const [game, setGame] = useState<RecentGame | null>(null);
  const [stillIn, setStillIn] = useState(false);

  useEffect(() => {
    const recent = getRecentGame();
    setGame(null);
    if (!recent || recent.gameId === currentGameId) return;
    let alive = true;
    findGameByCode(recent.code)
      .then(async (r) => {
        if (!alive) return;
        if (r.game_id !== recent.gameId || r.players === 0) {
          clearRecentGame();
          return;
        }
        // Still a player? Removed (kicked, away too long) means "Join again"; banned, nothing.
        const status = getMe(recent.gameId) ? (await myStatus(recent.gameId)).status : "none";
        if (!alive) return;
        if (status === "banned") {
          clearRecentGame();
          return;
        }
        setStillIn(status === "player");
        setGame(recent);
      })
      .catch((e) => {
        if (alive && e instanceof ApiError && e.status === 404) clearRecentGame(); // the game has ended
      });
    return () => {
      alive = false;
    };
  }, [currentGameId]);

  if (!game) return null;
  return (
    <div
      data-testid="recent-game-bar"
      role="status"
      className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft py-2 pr-2 pl-4 text-sm text-primary-soft-ink"
    >
      <Users className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {stillIn ? "You're still in game " : "Game "}
        <span className="font-display font-semibold tracking-[0.1em]">{game.code}</span>
        {stillIn ? "." : " is still going."}
      </p>
      <Link to={`/g/${game.gameId}`} className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-4 font-semibold text-white">
        {stillIn ? "Back to game" : "Join again"}
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          clearRecentGame();
          setGame(null);
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface/60"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
