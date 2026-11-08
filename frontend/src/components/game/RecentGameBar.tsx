import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users, X } from "lucide-react";
import { ApiError, cancelJoinRequest, confirmJoin, findGameByCode, myStatus, rejoin } from "../../lib/api";
import { getMe } from "../../lib/players";
import { clearRecentGame, getRecentGame, type RecentGame } from "../../lib/recentGame";
import type { MyStatus } from "../../lib/types";
import { StatusDialog } from "./StatusDialog";

/** How often to check while a request to join is waiting for the host. */
const POLL_MS = 5000;

/**
 * A bar at the top of the wheel page about the last multiplayer game you were in (not shown on
 * that game itself), while it's still going:
 * - still a player: "You're still in game ABC123. Back to game"
 * - left it: "Game ABC123 is still going. Join again"
 * - kicked or away too long: "You were removed from game ABC123. Ask to join again"
 * - asked: "You asked to join game ABC123. Waiting for the host…", checked every few seconds.
 *   Accepted: a card asks if you still want to join. Declined: the bar goes and a card says so.
 */
export function RecentGameBar({ currentGameId }: { currentGameId: string }) {
  const navigate = useNavigate();
  const [game, setGame] = useState<RecentGame | null>(null);
  const [status, setStatus] = useState<MyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const forget = useCallback(() => {
    clearRecentGame();
    setGame(null);
    setStatus(null);
  }, []);

  // Look the game up once per page.
  useEffect(() => {
    const recent = getRecentGame();
    setGame(null);
    setStatus(null);
    setNote(null);
    if (!recent || recent.gameId === currentGameId) return;
    let alive = true;
    findGameByCode(recent.code)
      .then(async (r) => {
        if (!alive) return;
        if (r.game_id !== recent.gameId || r.players === 0) {
          clearRecentGame();
          return;
        }
        const st: MyStatus = getMe(recent.gameId) ? await myStatus(recent.gameId) : { status: "none", request: null };
        if (!alive) return;
        if (st.status === "banned") {
          clearRecentGame();
          return;
        }
        setStatus(st);
        setGame(recent);
      })
      .catch((e) => {
        if (alive && e instanceof ApiError && e.status === 404) clearRecentGame(); // the game has ended
      });
    return () => {
      alive = false;
    };
  }, [currentGameId]);

  // While waiting for the host, check now and then.
  const waiting = status?.request === "pending";
  useEffect(() => {
    if (!game || !waiting) return;
    const t = setInterval(() => {
      myStatus(game.gameId).then(setStatus, () => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [game, waiting]);

  if (!game || !status) return null;

  const ask = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await rejoin(game.gameId);
      if (r.rejoined) navigate(`/g/${game.gameId}`);
      else setStatus({ ...status, request: "pending" });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not ask");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      await confirmJoin(game.gameId);
      navigate(`/g/${game.gameId}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not join");
      setBusy(false);
    }
  };

  const dismissRequest = async () => {
    await cancelJoinRequest(game.gameId).catch(() => {});
    forget();
  };

  // Accepted or declined: a card in the middle of the screen, and no bar.
  if (status.request === "accepted" || status.request === "declined") {
    return (
      <StatusDialog
        standing={{ status: status.status === "player" ? "none" : status.status, request: status.request }}
        code={game.code}
        policy="open"
        busy={busy}
        onAsk={() => {}}
        onConfirm={() => void join()}
        onNoThanks={() => void dismissRequest()}
        onOk={() => void dismissRequest()}
      />
    );
  }

  const removed = status.status === "kicked" || status.status === "timed_out";
  const stillIn = status.status === "player";
  const code = <span className="font-display font-semibold tracking-[0.1em]">{game.code}</span>;
  let message;
  let action = null;
  if (waiting) {
    message = <>You asked to join game {code}. Waiting for the host…</>;
  } else if (removed) {
    message = status.status === "kicked" ? <>You were removed from game {code}.</> : <>You left game {code} after being away.</>;
    action = (
      <button type="button" onClick={() => void ask()} disabled={busy} className={barBtn}>
        {status.status === "kicked" ? "Ask to join again" : "Join again"}
      </button>
    );
  } else {
    message = stillIn ? <>You're still in game {code}.</> : <>Game {code} is still going.</>;
    action = (
      <Link to={`/g/${game.gameId}`} className={barBtn}>
        {stillIn ? "Back to game" : "Join again"}
      </Link>
    );
  }

  return (
    <div
      data-testid="recent-game-bar"
      role="status"
      className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft py-2 pr-2 pl-4 text-sm text-primary-soft-ink"
    >
      <Users className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {message}
        {note && <span className="block text-[13px] opacity-80">{note}</span>}
      </p>
      {action}
      <button
        type="button"
        aria-label={waiting ? "Cancel request" : "Dismiss"}
        title={waiting ? "Cancel request" : "Dismiss"}
        onClick={() => void (waiting ? dismissRequest() : Promise.resolve(forget()))}
        className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface/60"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

const barBtn =
  "inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-4 font-semibold text-white disabled:opacity-60";
