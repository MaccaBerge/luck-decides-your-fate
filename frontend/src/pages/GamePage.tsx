import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import * as api from "../lib/api";
import { ApiError } from "../lib/api";
import type { Entry, PlayerEvent, PublicGameState, SpinStarted } from "../lib/types";
import { connectGameSocket } from "../lib/ws";
import { useTheme } from "../lib/theme";
import { loadSoundPref, saveSoundPref, unlockAudio } from "../lib/sound";
import { setLastGameId } from "../lib/storage";
import { SLICE_COLORS } from "../lib/palette";
import { BRAND_TITLE, GAME_TITLE } from "../lib/brand";
import Wheel from "../components/wheel/Wheel";
import { GameToolbar } from "../components/game/GameToolbar";
import { EntryPanel } from "../components/game/EntryPanel";
import { PasteNamesDialog } from "../components/game/PasteNamesDialog";
import { QrDialog } from "../components/game/QrDialog";
import { ResultDialog } from "../components/game/ResultDialog";
import { Toast, type ToastMsg } from "../components/game/Toast";
import { Loading } from "../components/game/Loading";
import { PrivacyLink } from "../components/game/PrivacyLink";
import NotFoundPage from "./NotFoundPage";

interface Result {
  spin: SpinStarted;
  name: string;
}

function fireConfetti() {
  const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  const colors = [...SLICE_COLORS, primary];
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
  const [pasteOpen, setPasteOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [sound, setSound] = useState(loadSoundPref);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [removing, setRemoving] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [spinRequested, setSpinRequested] = useState(false);

  const seenSpinIds = useRef<Set<number>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setResult({ spin: s, name: s.winner_name });
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

  const wheelUrl = `${location.origin}/g/${game.id}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(wheelUrl);
      showToast("Link copied", "info");
    } catch {
      showToast(wheelUrl, "info");
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

  // Never names a winner while spinning: the server's state can name it before the wheel lands.
  const caption = spinning ? (
    "Spinning…"
  ) : active.length === 0 ? (
    "Add at least two names to spin"
  ) : active.length === 1 ? (
    game.last_result ? (
      `${active[0].name} is the last one standing`
    ) : (
      "Add one more name to spin"
    )
  ) : game.last_result ? (
    <>
      Last pick{" "}
      <strong className="font-display text-[15px] font-semibold text-primary-strong">{game.last_result.winner_name}</strong>
    </>
  ) : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col gap-7 px-4 pt-7 pb-12 text-ink sm:px-6">
      <GameToolbar
        soundEnabled={sound}
        dark={theme === "dark"}
        onToggleSound={toggleSound}
        onToggleTheme={toggleTheme}
        onNewWheel={() => void newWheel()}
        onCopyLink={() => void copyLink()}
        onShowQr={() => setQrOpen(true)}
        newBusy={newBusy}
      />

      <main className="grid grid-cols-1 items-start gap-7 md:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <section
          aria-label="Wheel"
          className="flex min-w-0 flex-col items-center gap-6 rounded-[28px] border border-border bg-surface px-4 pt-9 pb-8 sm:px-6"
        >
          <h1 className="text-center font-display text-2xl font-semibold tracking-[-0.005em] sm:text-[30px]">Who's it gonna be?</h1>
          <div className="group @container relative w-full max-w-[min(500px,calc(100dvh-19rem))] min-w-[240px]">
            <div className={canSpin ? "cursor-pointer" : ""} onClick={() => void doSpin()}>
              <Wheel
                entries={game.entries}
                spin={activeSpin}
                onSpinComplete={handleSpinComplete}
                soundEnabled={sound}
                showHub={false}
              />
            </div>
            <button
              type="button"
              onClick={() => void doSpin()}
              disabled={!canSpin}
              aria-label="Spin the wheel"
              className="absolute top-1/2 left-1/2 size-[20%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-white bg-primary font-display text-[clamp(14px,4.2cqw,21px)] font-semibold text-white shadow-[0_4px_0_var(--primary-shadow),0_10px_24px_var(--spin-glow)] transition-[translate,box-shadow] duration-[80ms] enabled:active:translate-y-[calc(-50%+3px)] enabled:active:shadow-[0_1px_0_var(--primary-shadow)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
            >
              Spin
            </button>
          </div>
          <p
            role="status"
            aria-live="polite"
            className={`inline-flex min-h-9 items-center gap-2 rounded-full bg-bg px-4 py-2 text-center text-sm text-ink-muted ${caption ? "" : "invisible"}`}
          >
            {caption}
          </p>
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

      <footer className="-mt-4 flex justify-center">
        <PrivacyLink />
      </footer>

      <PasteNamesDialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={(names) => mutate(() => api.addEntries(game.id, names))}
      />
      <ResultDialog
        winner={result ? { name: result.name } : null}
        showRemove={!game.settings.remove_winner && game.entries.some((e) => e.id === result?.spin.winner_entry_id && e.is_active)}
        removing={removing}
        onClose={() => setResult(null)}
        onRemove={() => void removeWinner()}
      />
      <QrDialog
        url={qrOpen ? wheelUrl : null}
        onClose={() => setQrOpen(false)}
        onError={() => {
          setQrOpen(false);
          showToast("Could not create the QR code");
        }}
      />
      <Toast toast={toast} />
    </div>
  );
}
