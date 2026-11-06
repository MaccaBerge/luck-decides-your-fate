import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Minus, Save, Users } from "lucide-react";
import Wheel from "../components/wheel/Wheel";
import type { Mode, SpinStarted } from "../lib/types";
import * as adminApi from "./adminApi";
import { errorMessage, errorStatus, parseNames, type UpdateLinkBody } from "./adminApi";
import type { AdminGameState, AdminLinkEvent } from "./adminTypes";
import { useAdminAuth } from "./auth";
import { useAdminLinkSocket } from "./useAdminSocket";
import RuleStatusBanner from "./components/RuleStatusBanner";
import {
  btnPrimary,
  btnSecondary,
  card,
  clockTime,
  CopyButton,
  DeleteWithConfirm,
  ErrorText,
  input,
  linkTitle,
  LogoutButton,
  MODE_LABEL,
  ModeRadioGroup,
  StatusBadge,
} from "./components/ui";

/**
 * Keeps a local text draft in sync with a server value, but only while the user
 * hasn't edited it (so live updates never clobber typing).
 */
function useDraft(serverValue: string | undefined) {
  const [draft, setDraft] = useState(serverValue ?? "");
  const lastServer = useRef(serverValue);
  useEffect(() => {
    if (serverValue === undefined) return;
    const prev = lastServer.current;
    lastServer.current = serverValue;
    setDraft((d) => (prev === undefined || d === prev ? serverValue : d));
  }, [serverValue]);
  const dirty = serverValue !== undefined && draft !== serverValue;
  return [draft, setDraft, dirty] as const;
}

export default function LinkControlPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { onUnauthorized, logout } = useAdminAuth();
  const [st, setSt] = useState<AdminGameState | null>(null);
  const [spin, setSpin] = useState<SpinStarted | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [saving, setSaving] = useState<"targets" | "label" | null>(null);

  const goDashboard = useCallback(() => navigate("/admin"), [navigate]);

  const handleError = useCallback(
    (err: unknown) => {
      const s = errorStatus(err);
      if (s === 401) onUnauthorized();
      else if (s === 404) setNotFound(true);
      else setError(errorMessage(err));
    },
    [onUnauthorized],
  );

  const applyState = useCallback((next: AdminGameState) => {
    setSt(next);
    const cs = next.game.current_spin;
    if (cs) setSpin((prev) => (prev?.spin_id === cs.spin_id ? prev : cs));
  }, []);

  useEffect(() => {
    if (!gameId) return;
    setSt(null);
    setSpin(null);
    setNotFound(false);
    adminApi.getLink(gameId).then(applyState, handleError);
  }, [gameId, applyState, handleError]);

  useAdminLinkSocket(
    gameId,
    (e: AdminLinkEvent) => {
      switch (e.type) {
        case "admin_state":
          applyState(e.state);
          break;
        case "spin_started":
          setSpin((prev) => (prev?.spin_id === e.spin.spin_id ? prev : e.spin));
          break;
        case "game_deleted":
          goDashboard();
          break;
        default:
          break;
      }
    },
    { onUnauthorized, onNotFound: () => setNotFound(true) },
  );

  const [targetsDraft, setTargetsDraft, targetsDirty] = useDraft(st?.link.target_names.join("\n"));
  const [labelDraft, setLabelDraft, labelDirty] = useDraft(st ? (st.link.label ?? "") : undefined);

  async function patch(body: UpdateLinkBody) {
    if (!gameId) return;
    setError("");
    try {
      applyState(await adminApi.updateLink(gameId, body));
    } catch (err) {
      handleError(err);
    }
  }

  async function changeMode(m: Mode) {
    setPendingMode(m);
    await patch({ mode: m });
    setPendingMode(null);
  }

  async function saveTargets() {
    setSaving("targets");
    await patch({ target_names: parseNames(targetsDraft) });
    setSaving(null);
  }

  async function saveLabel() {
    setSaving("label");
    await patch({ label: labelDraft.trim() || null });
    setSaving(null);
  }

  async function remove() {
    if (!gameId) return;
    try {
      await adminApi.deleteLink(gameId);
      goDashboard();
    } catch (err) {
      handleError(err);
    }
  }

  const header = (
    <header className="flex items-center justify-between gap-2">
      <button type="button" className={btnSecondary} onClick={goDashboard}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to dashboard
      </button>
      <LogoutButton onClick={logout} />
    </header>
  );

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:py-8">
        {header}
        <div className={card}>
          <p className="font-medium">This link no longer exists.</p>
        </div>
      </div>
    );
  }

  if (!st) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:py-8">
        {header}
        <ErrorText>{error}</ErrorText>
        <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading link" />
      </div>
    );
  }

  const { link, game, rule_status, spin_history } = st;
  const url = `${location.origin}/g/${game.id}`;
  const title = linkTitle(link.label);
  const matched = new Set(rule_status.matched_entry_ids);
  const active = game.entries.filter((e) => e.is_active);
  const inactive = game.entries.filter((e) => !e.is_active);
  const displayMode = pendingMode ?? link.mode;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:py-8">
      {header}

      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 truncate text-lg font-semibold">{title}</h1>
          <StatusBadge status={link.status} />
          <span className="inline-flex items-center gap-1 text-sm text-muted">
            <Users className="h-4 w-4" aria-hidden />
            <span data-testid="player-count" className="font-semibold tabular-nums">
              {link.player_count}
            </span>
            {link.player_count === 1 ? "player" : "players"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <code
            data-testid="link-url"
            className="min-w-0 flex-1 truncate rounded-md bg-ink/5 px-3 py-2 text-sm"
            title={url}
          >
            {url}
          </code>
          <CopyButton text={url} label="Copy link" />
        </div>
      </section>

      <ErrorText>{error}</ErrorText>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${card} space-y-4`}>
          <h2 className="text-base font-semibold">Rules</h2>
          <RuleStatusBanner status={rule_status} mode={link.mode} />
          <div className="space-y-1">
            <span className="text-sm text-muted">Mode (applies immediately)</span>
            <ModeRadioGroup
              name={`mode-${game.id}`}
              value={displayMode}
              onChange={changeMode}
              disabled={pendingMode !== null}
            />
          </div>
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-sm text-muted">
                Target names, one per line, in priority order
              </span>
              <textarea
                aria-label="Target names"
                className={`${input} min-h-24 resize-y`}
                rows={3}
                value={targetsDraft}
                onChange={(e) => setTargetsDraft(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={btnPrimary}
              onClick={saveTargets}
              disabled={saving !== null || !targetsDirty}
            >
              {saving === "targets" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Save target names
            </button>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-muted">Label (private)</span>
            <div className="flex gap-2">
              <input
                aria-label="Link label"
                className={input}
                maxLength={60}
                value={labelDraft}
                placeholder="Untitled"
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && labelDirty) saveLabel();
                }}
              />
              <button
                type="button"
                className={`${btnSecondary} shrink-0 whitespace-nowrap`}
                onClick={saveLabel}
                disabled={saving !== null || !labelDirty}
              >
                Save label
              </button>
            </div>
          </div>
        </section>

        <section className={`${card} space-y-4`}>
          <h2 className="text-base font-semibold">Live wheel</h2>
          <div className="mx-auto w-full max-w-[18rem]">
            <Wheel
              entries={game.entries}
              spin={spin}
              soundEnabled={false}
              ariaLabel={`Live wheel with ${active.length} names`}
            />
          </div>
          <p className="text-center text-sm text-muted" aria-live="polite">
            {game.current_spin
              ? "Spinning…"
              : game.last_result
                ? `Last winner: ${game.last_result.winner_name}`
                : "No spins yet"}
          </p>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Names ({active.length})</h3>
            {game.entries.length === 0 ? (
              <p className="text-sm text-muted">The wheel is empty.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {active.map((e) => {
                  const isX = matched.has(e.id);
                  return (
                    <li
                      key={e.id}
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${
                        isX
                          ? "border-brass bg-brass font-semibold text-on-brass"
                          : "border-line"
                      }`}
                      title={isX ? "Target" : undefined}
                    >
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
                      <span className="truncate">{e.name}</span>
                      {isX && <span className="sr-only"> (target)</span>}
                    </li>
                  );
                })}
                {inactive.map((e) => (
                  <li
                    key={e.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-sm text-muted line-through"
                  >
                    <span className="truncate">{e.name}</span>
                    <span className="sr-only"> (hidden)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className={`${card} min-w-0`}>
        <h2 className="mb-3 text-base font-semibold">Spin history</h2>
        {spin_history.length === 0 ? (
          <p className="text-sm text-muted">No spins yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Time</th>
                  <th className="py-1.5 pr-3 font-medium">Winner</th>
                  <th className="py-1.5 pr-3 font-medium">Mode</th>
                  <th className="py-1.5 font-medium">Rule applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {spin_history.map((s) => (
                  <tr key={s.spin_id}>
                    <td className="py-1.5 pr-3 tabular-nums text-muted">
                      {clockTime(s.started_at)}
                    </td>
                    <td className="max-w-[8rem] truncate py-1.5 pr-3 font-medium">
                      {s.winner_name}
                      {s.finished_at === null && (
                        <span className="ml-1 text-xs font-normal text-muted">(spinning)</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{MODE_LABEL[s.mode]}</td>
                    <td className="py-1.5">
                      {s.rule_applied ? (
                        <Check className="h-4 w-4 text-ink" aria-label="Yes" />
                      ) : (
                        <Minus className="h-4 w-4 text-muted" aria-label="No" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <DeleteWithConfirm label={`Delete link ${title}`} onConfirm={remove} />
      </div>
    </div>
  );
}
