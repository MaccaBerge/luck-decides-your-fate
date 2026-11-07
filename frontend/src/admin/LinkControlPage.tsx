import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Target } from "lucide-react";
import Wheel from "../components/wheel/Wheel";
import { textColorFor } from "../components/wheel/wheelMath";
import type { Mode, SpinStarted } from "../lib/types";
import * as adminApi from "./adminApi";
import { errorMessage, errorStatus, parseNames, type UpdateLinkBody } from "./adminApi";
import type { AdminGameState, AdminLinkEvent } from "./adminTypes";
import { useAdminAuth } from "./auth";
import { useAdminLinkSocket } from "./useAdminSocket";
import { sortByTarget, targetRanks, toggleTarget } from "./targets";
import RuleStatusBanner from "./components/RuleStatusBanner";
import {
  btnPill,
  btnPrimary,
  btnSecondary,
  card,
  cardTitle,
  clockTime,
  CopyButton,
  DeleteWithConfirm,
  ErrorText,
  fieldLabel,
  input,
  linkTitle,
  LogoutButton,
  MODE_LABEL,
  ModeRadioGroup,
  page,
  StatusBadge,
  textarea,
  Wordmark,
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
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

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

  /** Clicking a name (or its slice) adds it to the targets, or removes it if it's one already. */
  async function clickTarget(entryId: string) {
    const entry = st?.game.entries.find((e) => e.id === entryId && e.is_active);
    if (!st || !entry || pendingTarget) return;
    setPendingTarget(entryId);
    await patch({ target_names: toggleTarget(st.rule_status.targets, entry) });
    setPendingTarget(null);
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
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Wordmark>Controller</Wordmark>
      <nav className="flex items-center gap-2">
        <button type="button" className={btnSecondary} onClick={goDashboard}>
          Back to dashboard
        </button>
        <LogoutButton onClick={logout} />
      </nav>
    </header>
  );

  if (notFound) {
    return (
      <div className={page}>
        {header}
        <div className={card}>
          <p className="font-medium">This link no longer exists.</p>
        </div>
      </div>
    );
  }

  if (!st) {
    return (
      <div className={page}>
        {header}
        <ErrorText>{error}</ErrorText>
        <Loader2 className="size-6 animate-spin text-ink-muted" aria-label="Loading link" />
      </div>
    );
  }

  const { link, game, rule_status, spin_history } = st;
  const url = `${location.origin}/g/${game.id}`;
  const title = linkTitle(link.label);
  const matched = new Set(rule_status.matched_entry_ids);
  const ranks = targetRanks(rule_status.targets);
  const active = game.entries.filter((e) => e.is_active);
  const inactive = game.entries.filter((e) => !e.is_active);
  const displayMode = pendingMode ?? link.mode;

  return (
    <div className={page}>
      {header}

      <section aria-label="Link" className={`${card} flex flex-wrap items-center gap-x-6 gap-y-4 !py-5`}>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
          <h1 className="truncate font-display text-[26px] leading-tight font-semibold">{title}</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusBadge status={link.status} />
            <span className="text-[13px] text-ink-muted">
              <span data-testid="player-count" className="tabular-nums">
                {link.player_count}
              </span>{" "}
              {link.player_count === 1 ? "player" : "players"}, {active.length} {active.length === 1 ? "name" : "names"}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_400px] items-center gap-2">
          <code
            data-testid="link-url"
            className="flex h-[46px] min-w-0 flex-1 items-center overflow-hidden rounded-full bg-surface-tint px-4 text-sm font-medium text-ellipsis whitespace-nowrap"
            title={url}
          >
            {url}
          </code>
          <CopyButton text={url} label="Copy link" idleText="Copy link" className={`${btnPrimary} shrink-0`} />
        </div>
      </section>

      <ErrorText>{error}</ErrorText>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section aria-label="Rules" className={`${card} flex flex-col gap-[22px]`}>
          <h2 className="font-display text-xl font-semibold">Rules</h2>
          <div className="flex flex-col gap-2.5">
            <span className={fieldLabel}>Mode (applies immediately)</span>
            <ModeRadioGroup
              name={`mode-${game.id}`}
              value={displayMode}
              onChange={changeMode}
              disabled={pendingMode !== null}
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-2.5">
              <span className={fieldLabel}>Target names, one per line, in priority order</span>
              <textarea
                aria-label="Target names"
                className={textarea}
                rows={3}
                value={targetsDraft}
                onChange={(e) => setTargetsDraft(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`${btnPill} self-start`}
              onClick={saveTargets}
              disabled={saving !== null || !targetsDirty}
            >
              {saving === "targets" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save target names
            </button>
          </div>
          <RuleStatusBanner status={rule_status} mode={link.mode} />
          <div className="flex flex-col gap-2.5">
            <span className={fieldLabel}>Label (private)</span>
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

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Live wheel" className={`${card} flex flex-wrap items-center gap-7`}>
            <div className="mx-auto w-[220px] shrink-0 sm:mx-0">
              <Wheel
                entries={game.entries}
                spin={spin}
                soundEnabled={false}
                ariaLabel={`Live wheel with ${active.length} names`}
                onSliceClick={(id) => void clickTarget(id)}
              />
            </div>
            <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-3">
              <div className="flex items-center gap-2">
                <span aria-hidden className="size-2 rounded-full bg-success-dot" />
                <h2 className={cardTitle}>Their wheel, live</h2>
              </div>
              {game.entries.length === 0 ? (
                <p className="text-sm text-ink-muted">The wheel is empty.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {sortByTarget(active, ranks).map((e) => {
                    const isX = matched.has(e.id);
                    const rank = ranks.get(e.id);
                    return (
                      <li key={e.id} className="max-w-full">
                        <button
                          type="button"
                          aria-pressed={rank !== undefined}
                          aria-label={rank !== undefined ? `Remove ${e.name} from targets` : `Make ${e.name} a target`}
                          disabled={pendingTarget !== null}
                          onClick={() => void clickTarget(e.id)}
                          className={`flex h-[34px] max-w-full cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm transition-[box-shadow,opacity] disabled:cursor-wait ${
                            isX
                              ? "font-semibold shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--primary)]"
                              : rank !== undefined
                                ? "font-semibold shadow-[0_0_0_2px_var(--surface),0_0_0_3px_var(--ink-muted)]"
                                : "font-medium hover:shadow-[0_0_0_2px_var(--surface),0_0_0_3px_var(--ink-muted)]"
                          } ${pendingTarget === e.id ? "opacity-60" : ""}`}
                          style={{ backgroundColor: e.color, color: textColorFor(e.color) }}
                          title={isX ? "Target" : rank !== undefined ? `Target ${rank}` : "Click to make this a target"}
                        >
                          {isX && <Target className="size-3 shrink-0" aria-hidden />}
                          <span className="truncate">{e.name}</span>
                          {rank !== undefined && rule_status.targets.length > 1 && (
                            <span data-testid={`target-rank-${e.id}`} className="text-xs font-semibold tabular-nums opacity-80">
                              {rank}
                            </span>
                          )}
                          {isX && <span className="sr-only"> (target)</span>}
                        </button>
                      </li>
                    );
                  })}
                  {inactive.map((e) => (
                    <li
                      key={e.id}
                      className="flex h-[34px] max-w-full items-center rounded-full border border-dashed border-border-strong px-3.5 text-sm text-ink-muted line-through"
                    >
                      <span className="truncate">{e.name}</span>
                      <span className="sr-only"> (hidden)</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[13px] text-ink-muted" aria-live="polite">
                {game.current_spin
                  ? "Spinning…"
                  : game.last_result
                    ? `Last winner: ${game.last_result.winner_name}`
                    : "No spins yet"}
              </p>
              {active.length > 0 && (
                <p className="text-[13px] text-ink-muted">
                  Click a name or its slice to make it a target, and again to remove it.
                  {rule_status.targets.length > 1 && " Numbers show the priority order."}
                  {matched.size > 0 && link.mode !== "fair" && " The ringed name is the one in effect."}
                </p>
              )}
              {link.mode === "fair" && rule_status.targets.length > 0 && (
                <p className="text-[13px] text-ink-muted">Your targets are saved, but the mode is Fair, so they don't apply.</p>
              )}
            </div>
          </section>

          <section aria-label="Spin history" className={`${card} flex min-w-0 flex-col gap-3`}>
            <h2 className={cardTitle}>Spin history</h2>
            {spin_history.length === 0 ? (
              <p className="text-sm text-ink-muted">No spins yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="text-xs text-ink-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="py-2 pr-3 font-medium">Winner</th>
                      <th className="py-2 pr-3 font-medium">Mode</th>
                      <th className="py-2 text-right font-medium">Rule applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spin_history.map((s) => (
                      <tr key={s.spin_id} className="border-t border-divider">
                        <td className="py-3 pr-3 text-ink-muted tabular-nums">{clockTime(s.started_at)}</td>
                        <td className="max-w-[8rem] truncate py-3 pr-3 font-semibold">
                          {s.winner_name}
                          {s.finished_at === null && <span className="ml-1 text-xs font-normal text-ink-muted">(spinning)</span>}
                        </td>
                        <td className="py-3 pr-3">{MODE_LABEL[s.mode]}</td>
                        <td className="py-3 text-right">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              s.rule_applied ? "bg-primary-soft text-primary-strong" : "bg-surface-tint text-ink-muted"
                            }`}
                          >
                            {s.rule_applied ? "Rigged" : "Fair"}
                          </span>
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
      </div>
    </div>
  );
}
