import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { Minimize } from "lucide-react";
import * as api from "../lib/api";
import { ApiError } from "../lib/api";
import type { Entry, PlayerEvent, PublicGameState, SpinStarted } from "../lib/types";
import { connectGameSocket } from "../lib/ws";
import { useTheme } from "../lib/theme";
import { loadSoundPref, saveSoundPref, unlockAudio } from "../lib/sound";
import { setLastGameId } from "../lib/storage";
import { planLoad, type SavedList } from "../lib/savedLists";
import { SLICE_COLORS } from "../lib/palette";
import { BRAND_TITLE, GAME_TITLE } from "../lib/brand";
import Wheel from "../components/wheel/Wheel";
import { GameToolbar } from "../components/game/GameToolbar";
import { secondaryBtn } from "../components/game/buttons";
import { EntryPanel, MAX_ENTRIES } from "../components/game/EntryPanel";
import { PasteNamesDialog } from "../components/game/PasteNamesDialog";
import { QrDialog } from "../components/game/QrDialog";
import { ResultDialog } from "../components/game/ResultDialog";
import { SavedListsDialog } from "../components/game/SavedListsDialog";
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
  const [savedListsOpen, setSavedListsOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [sound, setSound] = useState(loadSoundPref);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [removing, setRemoving] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [spinRequested, setSpinRequested] = useState(false);
  const [bigScreen, setBigScreen] = useState(false);

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

  // Leaving big-screen mode also leaves fullscreen, and the other way round.
  useEffect(() => {
    if (!bigScreen) return;
    const onKey = (e: KeyboardEvent) => {
      // Capture phase, so this sees an open dialog before Modal's own listener closes it.
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) setBigScreen(false);
    };
    const onFullscreenChange = () => {
      // Browsers use Escape to leave fullscreen. An open dialog keeps the big-screen layout, which works without it.
      if (!document.fullscreenElement && !document.querySelector('[role="dialog"]')) setBigScreen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
  }, [bigScreen]);

  useEffect(() => {
    if (notFound) setBigScreen(false);
  }, [notFound]);

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

  const loadList = async (list: SavedList) => {
    const { toAdd, leftOut } = planLoad(list.names, game.entries.map((e) => e.name), MAX_ENTRIES);
    if (toAdd.length > 0 && !(await mutate(() => api.addEntries(game.id, toAdd)))) return false;
    if (leftOut > 0) showToast(`${leftOut} ${leftOut === 1 ? "name" : "names"} didn't fit on the wheel`, "info");
    else if (toAdd.length === 0) showToast("Those names are already on the wheel", "info");
    return true;
  };

  const enterBigScreen = () => {
    setBigScreen(true);
    // The root element keeps dialogs and confetti visible. iPhone Safari has no fullscreen; the layout works without it.
    void document.documentElement.requestFullscreen?.().catch(() => {});
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
      <span className="shrink-0">Last pick</span>
      <strong className="min-w-0 truncate font-display text-[15px] font-semibold text-primary-strong">
        {game.last_result.winner_name}
      </strong>
    </>
  ) : null;

  return (
