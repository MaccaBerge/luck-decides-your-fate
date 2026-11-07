import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, createGame, getGame } from "../lib/api";
import { isWheelOpenElsewhere } from "../lib/openWheels";
import { clearLastGameId, getLastGameId } from "../lib/storage";
import { Loading } from "../components/game/Loading";
import { primaryBtn } from "../components/game/buttons";

export default function HomePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const go = async () => {
    setError(null);
    try {
      const last = getLastGameId();
      // Another tab already shows the saved wheel: give this tab its own.
      if (last && !(await isWheelOpenElsewhere(last))) {
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">Couldn't set up your wheel.</p>
        <p className="text-sm text-ink-muted">{error}</p>
        <button
          type="button"
          onClick={() => void go()}
          className={primaryBtn}
        >
          Try again
        </button>
      </div>
    );
  }
  return <Loading />;
}
