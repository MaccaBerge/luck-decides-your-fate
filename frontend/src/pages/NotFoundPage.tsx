import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGame } from "../lib/api";
import { primaryBtn } from "../components/game/buttons";
import { WheelMark } from "../components/game/WheelMark";

export default function NotFoundPage() {
  const navigate = useNavigate();
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
      <button
        type="button"
        onClick={() => void create()}
        disabled={busy}
        className={primaryBtn}
      >
        Create a new wheel
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </main>
  );
}
