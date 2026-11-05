import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { Sparkles } from "lucide-react";
import * as api from "../lib/api";
import { ApiError } from "../lib/api";
import type { Entry, PlayerEvent, PublicGameState, SpinStarted } from "../lib/types";
import { connectGameSocket } from "../lib/ws";
import { useTheme } from "../lib/theme";
import { loadSoundPref, saveSoundPref, unlockAudio } from "../lib/sound";
import { setLastGameId } from "../lib/storage";
import { BRAND_TITLE, GAME_TITLE } from "../lib/brand";
import Wheel from "../components/wheel/Wheel";
import { GameToolbar } from "../components/game/GameToolbar";
import { EntryPanel } from "../components/game/EntryPanel";
import { PasteNamesDialog } from "../components/game/PasteNamesDialog";
import { ResultDialog } from "../components/game/ResultDialog";
import { Toast, type ToastMsg } from "../components/game/Toast";
import { Loading } from "../components/game/Loading";
import NotFoundPage from "./NotFoundPage";

interface Result {
  spin: SpinStarted;
  name: string;
  color: string;
}

function fireConfetti() {
  const colors = ["#EF4444", "#F59E0B", "#22C55E", "#06B6D4", "#8B5CF6", "#EC4899"];
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  void confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors, zIndex: 70 });
  setTimeout(() => {
    void confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, zIndex: 70 });
    void confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, zIndex: 70 });
  }, 180);
}

export default function GamePage() {
  const { gameId = "" } = useParams();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();

  const [game, setGame] = useState<PublicGameState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeSpin, setActiveSpin] = useState<SpinStarted | null>(null);
  const [animating, setAnimating] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [sound, setSound] = useState(loadSoundPref);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [removing, setRemoving] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [spinRequested, setSpinRequested] = useState(false);

  const seenSpinIds = useRef<Set<number>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameRef = useRef<PublicGameState | null>(null);
  gameRef.current = game;

  const showToast = useCallback((text: string, kind: ToastMsg["kind"] = "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, kind });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  /** Start animating a spin unless we've already seen this spin_id (HTTP 202 vs WS spin_started). */
  const beginSpin = useCallback((s: SpinStarted) => {
    if (seenSpinIds.current.has(s.spin_id)) return;
    seenSpinIds.current.add(s.spin_id);
    setResult(null);
    setAnimating(true);
    setStatus("Spinning…");
    setActiveSpin(s);
  }, []);

  useEffect(() => {
    document.title = notFound ? BRAND_TITLE : GAME_TITLE;
    return () => {
      document.title = BRAND_TITLE;
    };
  }, [notFound]);

  // Reset when the game id changes.
  useEffect(() => {
    setGame(null);
    setNotFound(false);
    setActiveSpin(null);
    setAnimating(false);
    setResult(null);
    setStatus("");
    seenSpinIds.current = new Set();
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    let alive = true;

    const applyState = (s: PublicGameState) => {
      if (!alive) return;
      setGame(s);
      setLastGameId(s.id);
      if (s.current_spin) beginSpin(s.current_spin);
    };

    api
      .getGame(gameId)
      .then(applyState)
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else showToast(e instanceof Error ? e.message : "Could not load the wheel");
      });

    const dispose = connectGameSocket(
      gameId,
      (ev: PlayerEvent) => {
        if (!alive) return;
        switch (ev.type) {
          case "state":
            applyState(ev.state);
            break;
          case "spin_started":
            beginSpin(ev.spin);
            break;
          case "spin_finished":
            break; // the Wheel finishes on its own clock; a "state" follows.
          case "game_deleted":
            setNotFound(true);
            break;
        }
      },
      (code) => {
        if (alive && code === 4404) setNotFound(true);
      },
    );

    return () => {
      alive = false;
      dispose();
    };
  }, [gameId, beginSpin, showToast]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const handleSpinComplete = useCallback((s: SpinStarted) => {
    setAnimating(false);
    const entry = gameRef.current?.entries.find((e) => e.id === s.winner_entry_id);
    setResult({ spin: s, name: s.winner_name, color: entry?.color ?? "#8B5CF6" });
    setStatus(`Winner: ${s.winner_name}`);
    fireConfetti();
  }, []);

  const mutate = useCallback(
    async (fn: () => Promise<PublicGameState>): Promise<boolean> => {
      try {
        const s = await fn();
        setGame(s);
        return true;
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Something went wrong");
        return false;
      }
    },
    [showToast],
  );

  if (notFound) return <NotFoundPage />;
  if (!game) return <Loading />;

  const active = game.entries.filter((e) => e.is_active).sort((a, b) => a.position - b.position);
  const spinning = game.current_spin !== null || animating;
  const canSpin = !spinning && !spinRequested && active.length >= 2;

  const doSpin = async () => {
    if (!canSpin) return;
    unlockAudio();
    setSpinRequested(true);
    try {
      const s = await api.spin(game.id);
      beginSpin(s);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not spin");
    } finally {
      setSpinRequested(false);
    }
  };

  const removeWinner = async () => {
    if (!result) return;
    setRemoving(true);
    const id = result.spin.winner_entry_id;
    const attempt = () => api.updateEntry(game.id, id, { is_active: false });
    let ok = false;
    try {
      setGame(await attempt());
      ok = true;
    } catch (e) {
      // The server holds the spin lock ~300 ms past the animation; retry once.
      if (e instanceof ApiError && e.code === "spin_in_progress") {
        await new Promise((r) => setTimeout(r, 500));
        ok = await mutate(attempt);
      } else {
        showToast(e instanceof Error ? e.message : "Something went wrong");
      }
    }
    setRemoving(false);
    if (ok) setResult(null);
  };

  const copyLink = async () => {
    const url = `${location.origin}/g/${game.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied — share it with your friends!", "info");
    } catch {
      showToast(url, "info");
    }
  };

  const newWheel = async () => {
    setNewBusy(true);
    try {
      const g = await api.createGame();
      navigate(`/g/${g.id}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create a wheel");
    } finally {
      setNewBusy(false);
    }
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    saveSoundPref(next);
    if (next) unlockAudio();
  };

  const onEntry = (e: Entry, patch: { name?: string; color?: string; is_active?: boolean }) =>
    void mutate(() => api.updateEntry(game.id, e.id, patch));

  const lastStanding = active.length === 1 && !spinning ? active[0].name : null;

  return (
    <div className="min-h-screen pb-10 text-slate-900 dark:text-white">
      <GameToolbar
        soundEnabled={sound}
        dark={theme === "dark"}
        onToggleSound={toggleSound}
        onToggleTheme={toggleTheme}
        onNewWheel={() => void newWheel()}
        onCopyLink={() => void copyLink()}
        newBusy={newBusy}
      />

      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 pt-4 sm:pt-6 md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] md:items-start md:gap-8 lg:gap-10">
        <section aria-label="Wheel" className="flex min-w-0 flex-col items-center">
          <div
            className={`w-full max-w-[min(560px,calc(100vh-14rem))] min-w-[240px] transition-transform ${
              canSpin ? "cursor-pointer hover:scale-[1.01]" : ""
            }`}
            onClick={() => void doSpin()}
          >
            <Wheel entries={game.entries} spin={activeSpin} onSpinComplete={handleSpinComplete} soundEnabled={sound} />
          </div>

          <button
            type="button"
            onClick={() => void doSpin()}
            disabled={!canSpin}
            aria-label="Spin the wheel"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 px-10 py-4 text-lg font-black tracking-wide text-white uppercase shadow-xl shadow-fuchsia-500/30 transition hover:scale-[1.04] hover:shadow-fuchsia-500/40 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-violet-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <Sparkles className="size-5" aria-hidden="true" />
            {spinning ? "Spinning…" : "Spin"}
          </button>

          <p className="mt-3 min-h-6 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">
            {lastStanding
              ? `${lastStanding} is the last one standing`
              : active.length === 0
                ? "Add at least two names to spin"
                : active.length === 1
                  ? null
                  : !spinning
                    ? "Click the wheel or press Spin"
                    : null}
          </p>
          <div aria-live="polite" role="status" className="sr-only">
            {status}
          </div>
        </section>

        <EntryPanel
          entries={game.entries}
          removeWinner={game.settings.remove_winner}
          disabled={spinning}
          onAdd={(names) => mutate(() => api.addEntries(game.id, names))}
          onOpenPaste={() => setPasteOpen(true)}
          onRename={(e, name) => onEntry(e, { name })}
          onColor={(e, color) => onEntry(e, { color })}
          onToggle={(e) => onEntry(e, { is_active: !e.is_active })}
          onRemove={(e) => void mutate(() => api.deleteEntry(game.id, e.id))}
          onShuffle={() => void mutate(() => api.shuffleEntries(game.id))}
          onRestore={() => void mutate(() => api.restoreEntries(game.id))}
          onRemoveWinnerChange={(v) => void mutate(() => api.updateSettings(game.id, { remove_winner: v }))}
        />
      </main>

      <PasteNamesDialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={(names) => mutate(() => api.addEntries(game.id, names))}
      />
      <ResultDialog
        winner={result ? { name: result.name, color: result.color } : null}
        showRemove={!game.settings.remove_winner && game.entries.some((e) => e.id === result?.spin.winner_entry_id && e.is_active)}
        removing={removing}
        onClose={() => setResult(null)}
        onRemove={() => void removeWinner()}
      />
      <Toast toast={toast} />
    </div>
  );
}
