import { useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import * as adminApi from "./adminApi";
import { errorMessage, errorStatus } from "./adminApi";
import { btnPrimary, card, ErrorText, input } from "./components/ui";

export default function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.login(password);
      onLoggedIn();
    } catch (err) {
      setError(errorStatus(err) === 401 ? "Wrong password" : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <form onSubmit={submit} className={`${card} w-full max-w-sm space-y-4`}>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
          <h1 className="text-lg font-semibold">Controller</h1>
        </div>
        <input
          type="password"
          aria-label="Admin password"
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
          className={input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorText>{error}</ErrorText>
        <button type="submit" className={`${btnPrimary} w-full`} disabled={busy || !password}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Log in
        </button>
      </form>
    </main>
  );
}
