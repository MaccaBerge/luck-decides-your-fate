import { useCallback, useEffect, useState } from "react";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import * as adminApi from "../adminApi";
import { errorMessage, errorStatus } from "../adminApi";
import type { AdminSession } from "../adminTypes";
import { btnGhostDanger, btnSecondary, card, cardTitle, ErrorText, relativeTime, useNow } from "./ui";

const isPhone = (device: string) => /^(iPhone|iPad|Android)/.test(device);

/**
 * The devices logged in to the controller. A login lasts until it's gone unused for 60 days (and
 * at most a year), so this is where to sign out a phone you no longer have.
 */
export function DevicesCard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const now = useNow();
  const [sessions, setSessions] = useState<AdminSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    adminApi.getSessions().then(
      (r) => setSessions(r.sessions),
      (err) => (errorStatus(err) === 401 ? onUnauthorized() : setError(errorMessage(err))),
    );
  }, [onUnauthorized]);
  useEffect(load, [load]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await action();
    } catch (err) {
      if (errorStatus(err) === 401) return onUnauthorized();
      // Already signed out elsewhere: the list below is refreshed either way.
      if (errorStatus(err) !== 404) setError(errorMessage(err));
    } finally {
      setBusy(null);
      load();
    }
  }

  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <section aria-label="Signed-in devices" className={`${card} flex min-w-0 flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={cardTitle}>Signed-in devices</h2>
        {others > 0 && (
          <button
            type="button"
            className={btnSecondary}
            disabled={busy !== null}
            onClick={() => run("others", adminApi.signOutOthers)}
          >
            {busy === "others" && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Sign out everywhere else
          </button>
        )}
      </div>
      <p className="text-sm text-ink-muted">You stay signed in until a device goes 60 days without opening the controller.</p>
      <ErrorText>{error}</ErrorText>
      {!sessions ? (
        <Loader2 className="size-5 animate-spin text-ink-muted" aria-label="Loading devices" />
      ) : (
        <ul data-testid="devices" className="flex flex-col divide-y divide-divider">
          {sessions.map((s) => {
            const Icon = isPhone(s.device) ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex min-w-0 items-center gap-3 py-3">
                <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {s.device}
                    {s.current && (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-ink">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-[13px] text-ink-muted">
                    {s.current ? "In use now" : `Last used ${relativeTime(s.last_used_at, now)}`} · signed in{" "}
                    {relativeTime(s.created_at, now)}
                  </p>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    aria-label={`Sign out ${s.device}`}
                    className={btnGhostDanger}
                    disabled={busy !== null}
                    onClick={() => run(s.id, () => adminApi.signOutDevice(s.id))}
                  >
                    {busy === s.id && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
