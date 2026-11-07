import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { Minimize, Users } from "lucide-react";
import * as api from "../lib/api";
import { ApiError } from "../lib/api";
import type { Entry, Player, PlayerEvent, PublicGameState, SpinStarted } from "../lib/types";
import { clearMe, getMe, setMe, type Me } from "../lib/players";
import { connectGameSocket } from "../lib/ws";
import { useTheme } from "../lib/theme";
import { loadSoundPref, saveSoundPref, unlockAudio } from "../lib/sound";
import { announceOpenWheel } from "../lib/openWheels";
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
import { HostDialog, type HostChoice } from "../components/game/HostDialog";
import { JoinCodeDialog } from "../components/game/JoinCodeDialog";
import { JoinScreen } from "../components/game/JoinScreen";
import { PlayerRow } from "../components/game/PlayerRow";
import { GuestPanel } from "../components/game/GuestPanel";
import { InviteCard } from "../components/game/InviteCard";
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
  // Multiplayer: which player this browser is (from local storage), and the dialogs around it.
  const [me, setMeState] = useState<Me | null>(() => getMe(gameId));
  const [watching, setWatching] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [playerBusy, setPlayerBusy] = useState(false);
  const sawMyself = useRef(false);

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
    setMeState(getMe(gameId));
    setWatching(false);
    sawMyself.current = false;
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
    // A new player ID reconnects the socket, now with (or without) a ticket.
  }, [gameId, me?.playerId, beginSpin, showToast]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // Tell new tabs this wheel is open here, so they start their own.
  const loadedId = game?.id;
  useEffect(() => (loadedId ? announceOpenWheel(loadedId) : undefined), [loadedId]);

  // Removed from the game (by the host, or after being away too long)? A state that doesn't list
  // this player may just be older than the join, so ask the server before forgetting the key.
  const myPlayerId = me?.playerId ?? null;
  const listed = !!game && game.players.some((p) => p.id === myPlayerId);
  const multiplayerId = game?.kind === "multiplayer" ? game.id : null;
  useEffect(() => {
    if (listed) {
      sawMyself.current = true;
      return;
    }
    if (!multiplayerId || !myPlayerId) return;
    let alive = true;
    api.socketTicket(multiplayerId).catch((e) => {
      if (!alive || !(e instanceof ApiError) || e.code !== "not_a_player") return;
      clearMe(multiplayerId);
      setMeState(null);
      if (sawMyself.current) showToast("You're no longer in this game", "info");
      sawMyself.current = false;
    });
    return () => {
      alive = false;
    };
  }, [listed, multiplayerId, myPlayerId, showToast]);

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
  const multiplayer = game.kind === "multiplayer";
  const myPlayer = multiplayer ? (game.players.find((p) => p.id === myPlayerId) ?? null) : null;
  // In a multiplayer game only the host spins and edits; the server enforces it too.
  const canControl = !multiplayer || !!myPlayer?.is_host;
  const canSpin = canControl && !spinning && !spinRequested && active.length >= 2;
  const host = game.players.find((p) => p.is_host) ?? null;

  const becomePlayer = (gameId: string, r: { player_id: string; player_token: string; state: PublicGameState }) => {
    const mine = { playerId: r.player_id, token: r.player_token };
    setMe(gameId, mine);
    setMeState(mine);
    setGame(r.state);
  };

  const hostWheel = async (name: string, avatar: string, choice: HostChoice) => {
    setPlayerBusy(true);
    try {
      if (choice === "fresh") {
        // A new, empty wheel becomes the game; this one is left exactly as it was.
        const fresh = await api.createGame();
        const r = await api.hostGame(fresh.id, name, avatar);
        setMe(fresh.id, { playerId: r.player_id, token: r.player_token });
        setHostOpen(false);
        navigate(`/g/${fresh.id}`);
      } else {
        becomePlayer(game.id, await api.hostGame(game.id, name, avatar));
        setHostOpen(false);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not host this wheel");
    } finally {
      setPlayerBusy(false);
    }
  };

  const joinThis = async (name: string, avatar: string) => {
    setPlayerBusy(true);
    try {
      becomePlayer(game.id, await api.joinGame(game.id, name, avatar));
      setWatching(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not join");
    } finally {
      setPlayerBusy(false);
    }
  };

  const leave = async () => {
    setPlayerBusy(true);
    try {
      const s = await api.leaveGame(game.id);
      clearMe(game.id);
      setMeState(null);
      sawMyself.current = false;
      setGame(s);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not leave");
    } finally {
      setPlayerBusy(false);
    }
  };

  const removePlayer = async (p: Player) => {
    setPlayerBusy(true);
    await mutate(() => api.removePlayer(game.id, p.id));
    setPlayerBusy(false);
  };

  const joinByCode = async (code: string) => {
    setPlayerBusy(true);
    setJoinCodeError(null);
    try {
      const { game_id } = await api.findGameByCode(code);
      setJoinCodeOpen(false);
      navigate(`/g/${game_id}`);
    } catch (e) {
      setJoinCodeError(e instanceof ApiError && e.code === "code_not_found" ? "No game with that code. Check it and try again." : e instanceof Error ? e.message : "Could not join");
    } finally {
      setPlayerBusy(false);
    }
  };

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

  // A multiplayer game's invite link carries its short code; a solo wheel's link is its own URL.
  const wheelUrl = multiplayer && game.join_code ? `${location.origin}/j/${game.join_code}` : `${location.origin}/g/${game.id}`;

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

  const toolbar = (
    <GameToolbar
      multiplayer={multiplayer}
      onHost={() => setHostOpen(true)}
      onJoinCode={() => {
        setJoinCodeError(null);
        setJoinCodeOpen(true);
      }}
      soundEnabled={sound}
      dark={theme === "dark"}
      onToggleSound={toggleSound}
      onToggleTheme={toggleTheme}
      onNewWheel={() => void newWheel()}
      onCopyLink={() => void copyLink()}
      onShowQr={() => setQrOpen(true)}
      newBusy={newBusy}
      onBigScreen={enterBigScreen}
    />
  );

  if (multiplayer && !myPlayer && !watching) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col gap-7 px-4 pt-7 pb-12 text-ink sm:px-6">
        {toolbar}
        <JoinScreen players={game.players} busy={playerBusy} onJoin={(n, a) => void joinThis(n, a)} onWatch={() => setWatching(true)} />
        <footer className="flex justify-center">
          <PrivacyLink />
        </footer>
        <QrDialog url={qrOpen ? wheelUrl : null} onClose={() => setQrOpen(false)} onError={() => setQrOpen(false)} />
        <Toast toast={toast} />
      </div>
    );
  }

  return (
    // Big-screen mode changes only classes around the wheel: remounting Wheel would break a running spin.
    <div
      className={
        bigScreen
          ? "flex h-dvh w-full flex-col overflow-hidden text-ink"
          : "mx-auto flex min-h-screen w-full max-w-[1180px] flex-col gap-7 px-4 pt-7 pb-12 text-ink sm:px-6"
      }
    >
      <div className={bigScreen ? "hidden" : "contents"}>
        {toolbar}
      </div>

      <main
        className={
          bigScreen
            ? "min-h-0 flex-1"
            : "grid grid-cols-1 items-start gap-7 md:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]"
        }
      >
        <section
          aria-label="Wheel"
          className={`flex min-w-0 flex-col items-center ${
            bigScreen
              ? "h-full justify-center gap-2 py-2"
              : "gap-6 rounded-[28px] border border-border bg-surface px-4 pt-9 pb-8 sm:px-6"
          }`}
        >
          {multiplayer && game.join_code && (
            <p
              data-testid="join-code"
              className={
                bigScreen
                  ? "hidden" // the invite card shows the code in big-screen mode
                  : "-mt-3 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3.5 py-1.5 text-sm font-semibold text-primary-soft-ink"
              }
            >
              <Users className="size-4" aria-hidden="true" />
              Multiplayer
              <span aria-hidden="true">·</span>
              <span>
                Code <span className="font-display tracking-[0.12em]">{game.join_code}</span>
              </span>
            </p>
          )}
          <h1 className={`text-center font-display text-2xl font-semibold tracking-[-0.005em] sm:text-[30px] ${bigScreen ? "hidden" : ""}`}>Who's it gonna be?</h1>
          <div
            className={`group @container relative ${
              bigScreen
                ? // As large as fits without scrolling: leaves room for the caption and its gap.
                  "w-[min(calc(100dvw-1rem),calc(100dvh-4.5rem))]"
                : "w-full max-w-[min(500px,calc(100dvh-19rem))] min-w-[240px]"
            }`}
          >
            <div className={canSpin ? "cursor-pointer" : ""} onClick={() => void doSpin()}>
              <Wheel
                entries={game.entries}
                spin={activeSpin}
                onSpinComplete={handleSpinComplete}
                soundEnabled={sound}
                // The Spin button covers the centre; guests in a multiplayer game don't get one.
                showHub={!canControl}
              />
            </div>
            {canControl && (
            <button
              type="button"
              onClick={() => void doSpin()}
              disabled={!canSpin}
              aria-label="Spin the wheel"
              className="absolute top-1/2 left-1/2 size-[20%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-white bg-primary font-display text-[clamp(14px,4.2cqw,21px)] font-semibold text-white shadow-[0_4px_0_var(--primary-shadow),0_10px_24px_var(--spin-glow)] transition-[translate,box-shadow] duration-[80ms] enabled:active:translate-y-[calc(-50%+3px)] enabled:active:shadow-[0_1px_0_var(--primary-shadow)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
            >
              Spin
            </button>
            )}
          </div>
          <p
            role="status"
            aria-live="polite"
            className={`inline-flex min-h-9 max-w-full items-center gap-2 rounded-full bg-bg px-4 py-2 text-center text-sm text-ink-muted ${caption ? "" : "invisible"}`}
          >
            {caption}
          </p>
          {multiplayer && !bigScreen && (
            <PlayerRow
              players={game.players}
              meId={myPlayer?.id ?? null}
              isHost={canControl}
              busy={playerBusy || spinning}
              onLeave={() => void leave()}
              onJoin={() => setWatching(false)}
              onRemove={(pl) => void removePlayer(pl)}
            />
          )}
        </section>

        <div className={bigScreen ? "hidden" : "contents"}>
          {canControl ? (
          <div className="flex min-w-0 flex-col gap-4">
          {multiplayer && game.join_code && (
            // The host's invite card: guests have nobody to invite.
            <InviteCard variant="panel" code={game.join_code} url={wheelUrl} players={game.players.length} />
          )}
          <EntryPanel
            entries={game.entries}
            // The server's state can list a spin before this viewer's wheel lands.
            recentSpins={game.recent_spins.filter((s) => !(animating && s.spin_id === activeSpin?.spin_id))}
            removeWinner={game.settings.remove_winner}
            disabled={spinning}
            onAdd={(names) => mutate(() => api.addEntries(game.id, names))}
            onOpenPaste={() => setPasteOpen(true)}
            onOpenSavedLists={() => setSavedListsOpen(true)}
            onRename={(e, name) => onEntry(e, { name })}
            onColor={(e, color) => onEntry(e, { color })}
            onToggle={(e) => onEntry(e, { is_active: !e.is_active })}
            onRemove={(e) => void mutate(() => api.deleteEntry(game.id, e.id))}
            onShuffle={() => void mutate(() => api.shuffleEntries(game.id))}
            onRestore={() => void mutate(() => api.restoreEntries(game.id))}
            onRemoveWinnerChange={(v) => void mutate(() => api.updateSettings(game.id, { remove_winner: v }))}
          />
          </div>
          ) : (
            <GuestPanel
              recentSpins={game.recent_spins.filter((s) => !(animating && s.spin_id === activeSpin?.spin_id))}
              hostName={host?.name ?? null}
            />
          )}
        </div>
      </main>

      <footer className={bigScreen ? "hidden" : "-mt-4 flex justify-center"}>
        <PrivacyLink />
      </footer>

      {bigScreen && multiplayer && game.join_code && (
        <InviteCard code={game.join_code} url={wheelUrl} players={game.players.length} />
      )}
      {bigScreen && (
        <button
          type="button"
          aria-label="Exit big screen"
          onClick={() => setBigScreen(false)}
          className={`${secondaryBtn} fixed top-3 right-3 z-40 w-11 !px-0`}
        >
          <Minimize className="size-[18px]" aria-hidden="true" />
        </button>
      )}

      <PasteNamesDialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={(names) => mutate(() => api.addEntries(game.id, names))}
      />
      <SavedListsDialog
        open={savedListsOpen}
        names={[...game.entries].sort((a, b) => a.position - b.position).map((e) => e.name)}
        disabled={spinning}
        onClose={() => setSavedListsOpen(false)}
        onLoad={loadList}
      />
      <ResultDialog
        winner={result ? { name: result.name } : null}
        showRemove={canControl && !game.settings.remove_winner && game.entries.some((e) => e.id === result?.spin.winner_entry_id && e.is_active)}
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
      <HostDialog
        open={hostOpen}
        busy={playerBusy}
        names={active.map((e) => e.name)}
        onClose={() => setHostOpen(false)}
        onHost={(n, a, choice) => void hostWheel(n, a, choice)}
      />
      <JoinCodeDialog
        open={joinCodeOpen}
        busy={playerBusy}
        error={joinCodeError}
        onClose={() => setJoinCodeOpen(false)}
        onJoin={(c) => void joinByCode(c)}
      />
      <Toast toast={toast} />
    </div>
  );
}
