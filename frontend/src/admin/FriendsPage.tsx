import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { Mode } from "../lib/types";
import * as adminApi from "./adminApi";
import { errorMessage, errorStatus, parseNames } from "./adminApi";
import type { FriendsSettings, StandingRule } from "./adminTypes";
import { useAdminAuth } from "./auth";
import { AlwaysOptions } from "./components/RuleExtras";
import { btnPill, card, ErrorText, fieldLabel, ModeRadioGroup, page, SubPageHeader, textarea } from "./components/ui";

/** One friend per line, the names they go by separated by commas. */
export function friendsToText(friends: string[][]): string {
  return friends.map((f) => f.join(", ")).join("\n");
}

export function textToFriends(text: string): string[][] {
  return text
    .split("\n")
    .map((line) => line.split(",").map((n) => n.trim()).filter(Boolean))
    .filter((f) => f.length > 0);
}

/**
 * The friends list and the standing rule. A wheel with at least two different friends on it is a
 * friends' wheel, and follows the standing rule unless you've given it its own.
 */
export default function FriendsPage() {
  const navigate = useNavigate();
  const { onUnauthorized, logout } = useAdminAuth();
  const [settings, setSettings] = useState<FriendsSettings | null>(null);
  const [friendsText, setFriendsText] = useState("");
  const [targetsText, setTargetsText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const handleError = useCallback(
    (err: unknown) => (errorStatus(err) === 401 ? onUnauthorized() : setError(errorMessage(err))),
    [onUnauthorized],
  );

  const apply = useCallback((s: FriendsSettings) => {
    setSettings(s);
    setFriendsText(friendsToText(s.friends));
    setTargetsText(s.standing.target_names.join("\n"));
  }, []);

  useEffect(() => {
    adminApi.getFriends().then(apply, handleError);
  }, [apply, handleError]);

  async function run(key: string, action: () => Promise<FriendsSettings>, done?: string) {
    setBusy(key);
    setError("");
    setSaved("");
    try {
      apply(await action());
      if (done) setSaved(done);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(null);
    }
  }

  const standing = settings?.standing;
  const patchStanding = (patch: Partial<StandingRule>) => run("standing", () => adminApi.updateStanding(patch));

  return (
    <div className={page}>
      <SubPageHeader onBack={() => navigate("/admin")} onLogout={logout} />
      <ErrorText>{error}</ErrorText>
      {!settings || !standing ? (
        <Loader2 className="size-6 animate-spin text-ink-muted" aria-label="Loading" />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section aria-label="Friends" className={`${card} flex flex-col gap-4`}>
            <h1 className="font-display text-xl font-semibold">Friends</h1>
            <p className="text-sm text-ink-muted">
              One friend per line. Put the names they go by on the same line, separated by commas, like{" "}
              <span className="font-medium text-ink">Jonas, Jonny</span>. A wheel with at least two different friends on
              it shows up as a friends' wheel.
            </p>
            <textarea
              aria-label="Friends"
              className={textarea}
              rows={8}
              value={friendsText}
              placeholder={"Jonas, Jonny\nMia\nMarcus, Macca"}
              onChange={(e) => setFriendsText(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`${btnPill} self-start`}
                disabled={busy !== null || friendsText === friendsToText(settings.friends)}
                onClick={() => run("friends", () => adminApi.putFriends(textToFriends(friendsText)), "Friends saved.")}
              >
                {busy === "friends" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Save friends
              </button>
              {saved && (
                <span role="status" className="text-sm text-ink-muted">
                  {saved}
                </span>
              )}
            </div>
          </section>

          <section aria-label="Standing rule" className={`${card} flex flex-col gap-[22px]`}>
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-xl font-semibold">Standing rule</h2>
              <p className="text-sm text-ink-muted">
                Decides every friends' wheel you haven't set yourself, from its first spin. Next winners you add to a
                wheel still come first.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className={fieldLabel}>Mode (applies immediately)</span>
              <ModeRadioGroup
                name="standing-mode"
                value={standing.mode}
                onChange={(mode: Mode) => void patchStanding({ mode })}
                disabled={busy !== null}
              />
            </div>
            <label className="flex flex-col gap-2.5">
              <span className={fieldLabel}>Target names, one per line, in priority order</span>
              <textarea
                aria-label="Standing rule target names"
                className={textarea}
                rows={3}
                value={targetsText}
                onChange={(e) => setTargetsText(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`${btnPill} self-start`}
              disabled={busy !== null || targetsText === standing.target_names.join("\n")}
              onClick={() => void patchStanding({ target_names: parseNames(targetsText) })}
            >
              {busy === "standing" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save target names
            </button>
            {standing.mode === "always" && (
              <AlwaysOptions
                link={{ id: "standing", chance: standing.chance, max_streak: standing.max_streak }}
                activeCount={0}
                onPatch={(body) => patchStanding(body)}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
