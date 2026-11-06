import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, Loader2, Plus, SlidersHorizontal, Users } from "lucide-react";
import type { Mode } from "../lib/types";
import * as adminApi from "./adminApi";
import { errorMessage, errorStatus, parseNames } from "./adminApi";
import type { Dashboard, LinkSummary } from "./adminTypes";
import { useAdminAuth } from "./auth";
import { useDashboardSocket } from "./useAdminSocket";
import {
  btnPrimary,
  btnSecondary,
  card,
  CopyButton,
  DeleteWithConfirm,
  ErrorText,
  input,
  linkTitle,
  LogoutButton,
  MODE_LABEL,
  ModeRadioGroup,
  relativeTime,
  StatusBadge,
  useNow,
} from "./components/ui";

export default function DashboardPage() {
  const { onUnauthorized, logout } = useAdminAuth();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [backingUp, setBackingUp] = useState(false);

  const handleError = useCallback(
    (err: unknown) => {
      if (errorStatus(err) === 401) onUnauthorized();
      else setError(errorMessage(err));
    },
    [onUnauthorized],
  );

  useEffect(() => {
    adminApi.getDashboard().then(setDash, handleError);
  }, [handleError]);

  useDashboardSocket((e) => {
    if (e.type === "dashboard") setDash(e.dashboard);
  }, onUnauthorized);

  async function downloadBackup() {
    setBackingUp(true);
    setError("");
    try {
      await adminApi.downloadBackup();
    } catch (err) {
      handleError(err);
    } finally {
      setBackingUp(false);
    }
  }

  async function remove(id: string) {
    try {
      await adminApi.deleteLink(id);
      setDash((d) => (d ? { ...d, links: d.links.filter((l) => l.id !== id) } : d));
    } catch (err) {
      handleError(err);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:py-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-normal sm:text-[2rem]">Controller</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Download backup"
            className={btnSecondary}
            disabled={backingUp}
            onClick={downloadBackup}
          >
            {backingUp ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            <span className="hidden sm:inline">Download backup</span>
          </button>
          <LogoutButton onClick={logout} />
        </div>
      </header>

      <p className="text-base">
        <span data-testid="live-games-count" className="text-2xl font-bold tabular-nums">
          {dash ? dash.live_games : "–"}
        </span>{" "}
        games live right now
      </p>

      <ErrorText>{error}</ErrorText>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <CreateLinkForm onError={handleError} />
        <section className={`${card} min-w-0`}>
          <h2 className="mb-3 text-base font-semibold">Links</h2>
          {!dash ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading links" />
          ) : dash.links.length === 0 ? (
            <p className="text-sm text-muted">No links yet. Create one to get started.</p>
          ) : (
            <ul className="divide-y divide-line">
              {dash.links.map((l) => (
                <LinkRow key={l.id} link={l} onDelete={() => remove(l.id)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function CreateLinkForm({ onError }: { onError: (err: unknown) => void }) {
  const navigate = useNavigate();
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<Mode>("fair");
  const [targets, setTargets] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const st = await adminApi.createLink({
        label: label.trim() || null,
        mode,
        target_names: parseNames(targets),
      });
      navigate(`/admin/links/${st.game.id}`);
    } catch (err) {
      if (errorStatus(err) === 401) onError(err);
      else setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-3 self-start`}>
      <h2 className="text-base font-semibold">New link</h2>
      <label className="block space-y-1">
        <span className="text-sm text-muted">Label (private)</span>
        <input
          aria-label="Link label"
          className={input}
          maxLength={60}
          placeholder="e.g. Friday party"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <div className="space-y-1">
        <span className="text-sm text-muted">Mode</span>
        <ModeRadioGroup name="create-mode" value={mode} onChange={setMode} />
      </div>
      <label className="block space-y-1">
        <span className="text-sm text-muted">Target names, one per line, in priority order</span>
        <textarea
          aria-label="Target names"
          className={`${input} min-h-24 resize-y`}
          rows={3}
          placeholder={"Jonas\nJonny"}
          value={targets}
          onChange={(e) => setTargets(e.target.value)}
        />
      </label>
      <ErrorText>{error}</ErrorText>
      <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        Create link
      </button>
    </form>
  );
}

function LinkRow({ link, onDelete }: { link: LinkSummary; onDelete: () => Promise<void> }) {
  const now = useNow();
  const title = linkTitle(link.label);
  const url = `${location.origin}${link.path}`;
  const targetsText =
    link.mode !== "fair" && link.target_names.length > 0 ? `: ${link.target_names.join(", ")}` : "";
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          <StatusBadge status={link.status} />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="truncate">
            {MODE_LABEL[link.mode]}
            {targetsText}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden />
            {link.player_count} {link.player_count === 1 ? "player" : "players"}
          </span>
          <span>{link.entry_count} names</span>
          <span>{relativeTime(link.last_activity_at, now)}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link to={`/admin/links/${link.id}`} aria-label={`Open controls for ${title}`} className={btnSecondary}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span>Controls</span>
        </Link>
        <CopyButton text={url} label={`Copy link for ${title}`} showText={false} />
        <DeleteWithConfirm label={`Delete link ${title}`} onConfirm={onDelete} compact />
      </div>
    </li>
  );
}
