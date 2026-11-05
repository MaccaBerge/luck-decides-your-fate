import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, createGame, getGame } from "../lib/api";
import { clearLastGameId, getLastGameId } from "../lib/storage";
import { Loading } from "../components/game/Loading";

export default function HomePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const go = async () => {
    setError(null);
    try {
      const last = getLastGameId();
      if (last) {
        try {
          const g = await getGame(last);
          navigate(`/g/${g.id}`, { replace: true });
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) clearLastGameId();
          else throw e;
        }
      }
      const g = await createGame();
      navigate(`/g/${g.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center text-slate-700 dark:text-slate-200">
        <p className="text-lg font-semibold">Couldn't set up your wheel.</p>
        <p className="text-sm opacity-75">{error}</p>
        <button
          type="button"
          onClick={() => void go()}
          className="rounded-full bg-violet-600 px-5 py-2.5 font-semibold text-white shadow-md hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
        >
          Try again
        </button>
      </div>
    );
  }
  return <Loading />;
}
