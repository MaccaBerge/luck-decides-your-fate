import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, createGame, getGame } from "../lib/api";
import { clearLastGameId, getLastGameId } from "../lib/storage";
import { primaryBtn, secondaryBtn } from "../components/game/buttons";
import { PrivacyLink } from "../components/game/PrivacyLink";
import { WheelMark } from "../components/game/WheelMark";

/** The id of the wheel saved in this browser, once we know it still exists (and isn't this page's). */
function useLastWheel(): string | null {
  const { gameId } = useParams();
  const [lastId, setLastId] = useState<string | null>(null);

  useEffect(() => {
    const last = getLastGameId();
    if (!last || last === gameId) return;
    let alive = true;
    getGame(last)
      .then((g) => alive && setLastId(g.id))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) clearLastGameId();
      });
    return () => {
      alive = false;
    };
  }, [gameId]);

  return lastId;
}

export default function NotFoundPage() {
  const navigate = useNavigate();
  const lastId = useLastWheel();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const g = await createGame();
      navigate(`/g/${g.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
      <WheelMark className="size-16" />
      <h1 className="font-display text-[30px] leading-tight font-semibold text-ink">
        This wheel doesn't exist
      </h1>
      <p className="max-w-sm text-ink-muted">
        The link may be wrong, or the wheel was removed.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy}
          className={primaryBtn}
        >
          Create a new wheel
        </button>
        {lastId && (
          <button type="button" onClick={() => navigate(`/g/${lastId}`)} className={secondaryBtn}>
            Open your last wheel
          </button>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <PrivacyLink />
    </main>
  );
}
