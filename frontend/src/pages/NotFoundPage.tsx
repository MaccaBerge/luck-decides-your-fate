import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { createGame } from "../lib/api";

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
      <div className="text-6xl" aria-hidden="true">
        🎡
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl dark:text-white">
        This wheel doesn't exist
      </h1>
      <p className="max-w-sm text-slate-600 dark:text-slate-300">
        The link may be wrong, or the wheel was removed. Start a fresh one in a click.
      </p>
      <button
        type="button"
        onClick={() => void create()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 font-bold text-white shadow-lg shadow-violet-500/30 transition hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-60"
      >
        <Plus className="size-5" aria-hidden="true" />
        Create a new wheel
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </main>
  );
}
