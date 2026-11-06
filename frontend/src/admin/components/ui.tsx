import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, LogOut, Trash2, X } from "lucide-react";
import type { Mode } from "../../lib/types";
import type { LinkStatus } from "../adminTypes";

export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btn} bg-brass text-on-brass hover:brightness-105`;
export const btnSecondary = `${btn} border border-line text-ink hover:bg-ink/10`;
export const btnDanger = `${btn} bg-danger text-on-danger hover:opacity-90`;
export const btnGhostDanger = `${btn} text-danger hover:bg-danger/15`;
export const input =
  "w-full rounded-md border border-line bg-transparent px-3 py-2 text-sm text-ink placeholder:text-muted";
export const card =
  "rounded-md bg-pad p-4 shadow-[0_2px_6px_rgb(0_0_0/0.12)] sm:p-5";

export const MODE_LABEL: Record<Mode, string> = { fair: "Fair", always: "Always", never: "Never" };

export function ModeRadioGroup({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: Mode;
  onChange: (m: Mode) => void;
  disabled?: boolean;
}) {
  const modes: Mode[] = ["fair", "always", "never"];
  return (
    <div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-2">
      {modes.map((m) => {
        const checked = value === m;
        return (
          <label
            key={m}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 py-2 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus) ${
              checked
                ? "border-ink bg-ink text-pad"
                : "border-line text-ink hover:bg-ink/10"
            } ${disabled ? "opacity-60" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={m}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(m)}
              className="h-4 w-4 accent-brass"
            />
            {MODE_LABEL[m]}
          </label>
        );
      })}
    </div>
  );
}

const STATUS: Record<LinkStatus, { text: string; dot: string; pill: string }> = {
  created: {
    text: "Created",
    dot: "ring-1 ring-muted",
    pill: "bg-ink/10 text-ink",
  },
  connected: {
    text: "Connected",
    dot: "bg-brass",
    pill: "bg-ink text-pad",
  },
  disconnected: {
    text: "Disconnected",
    dot: "bg-muted",
    pill: "bg-ink/10 text-muted",
  },
};

export function StatusBadge({ status }: { status: LinkStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.pill}`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${s.dot}`} />
      <span data-testid="link-status">{s.text}</span>
    </span>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  // Fallback for plain-http LAN access from a phone.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  text,
  label,
  showText = true,
  className = btnSecondary,
}: {
  text: string;
  label: string;
  showText?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 1500);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className}
      onClick={async () => setState((await copyText(text)) ? "ok" : "fail")}
    >
      {state === "ok" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {showText && <span>{state === "ok" ? "Copied" : state === "fail" ? "Copy failed" : "Copy"}</span>}
    </button>
  );
}

/** Delete button with an inline confirm step (no window.confirm). */
export function DeleteWithConfirm({
  label,
  onConfirm,
  compact,
}: {
  label: string;
  onConfirm: () => Promise<void> | void;
  compact?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        className={btnGhostDanger}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {!compact && <span>Delete link</span>}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={btnDanger}
        disabled={busy}
        autoFocus
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setConfirming(false);
          }
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Confirm delete
      </button>
      <button
        type="button"
        aria-label="Cancel delete"
        title="Cancel"
        className={btnSecondary}
        onClick={() => setConfirming(false)}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
}

export function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={btnSecondary} onClick={onClick}>
      <LogOut className="h-4 w-4" aria-hidden />
      Log out
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}

/** Re-render every `ms` so relative times stay fresh. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

export function clockTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function linkTitle(label: string | null): string {
  return label && label.trim() ? label : "Untitled";
}
