import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Trash2, X } from "lucide-react";
import type { Mode } from "../../lib/types";
import type { LinkStatus } from "../adminTypes";
import { card as sharedCard, pillBtn, primaryBtn, secondaryBtn, textBtn } from "../../components/game/buttons";
import { WheelMark } from "../../components/game/WheelMark";

export const btnPrimary = primaryBtn;
export const btnSecondary = secondaryBtn;
export const btnPill = pillBtn;
export const btnDanger = `${secondaryBtn} !border-danger !bg-danger !text-on-danger`;
export const btnGhostDanger = `${textBtn} !text-danger hover:bg-danger/10`;
export const input =
  "h-11 w-full rounded-xl border border-border-strong bg-surface-muted px-3.5 text-[15px] text-ink placeholder:text-ink-muted";
export const textarea =
  "w-full resize-y rounded-[14px] border border-border-strong bg-surface-muted px-3.5 py-3 text-[15px] leading-normal text-ink placeholder:text-ink-muted";
export const fieldLabel = "text-[13px] font-medium text-ink-muted";
export const cardTitle = "font-display text-[19px] font-semibold";
export const card = `${sharedCard} p-6`;
export const page = "mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pt-7 pb-12 sm:px-6";

export const MODE_LABEL: Record<Mode, string> = { fair: "Fair", always: "Always", never: "Never" };

export function Wordmark({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <WheelMark />
      <span className="font-display text-[19px] font-semibold">{children}</span>
    </div>
  );
}

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
    <div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-1 rounded-full bg-surface-tint p-1">
      {modes.map((m) => {
        const checked = value === m;
        return (
          <label
            key={m}
            className={`relative flex h-[42px] items-center justify-center rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
              checked
                ? "bg-surface font-display text-base font-semibold text-primary-strong shadow-[0_2px_6px_var(--segment-shadow)]"
                : "text-sm font-medium text-ink-muted hover:text-ink"
            } ${disabled ? "opacity-60" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={m}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(m)}
              className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-full opacity-0"
            />
            {MODE_LABEL[m]}
          </label>
        );
      })}
    </div>
  );
}

const STATUS: Record<LinkStatus, { text: string; dot: string; pill: string }> = {
  created: { text: "Created", dot: "bg-ink-muted", pill: "bg-surface-tint text-ink-muted" },
  connected: { text: "Connected", dot: "bg-success-dot", pill: "bg-success-soft text-success-ink" },
  disconnected: { text: "Disconnected", dot: "bg-ink-muted", pill: "bg-surface-tint text-ink-muted" },
};

export function StatusBadge({ status }: { status: LinkStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${s.pill}`}>
      <span aria-hidden className={`size-2 rounded-full ${s.dot}`} />
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
  idleText = "Copy",
  className = btnSecondary,
}: {
  text: string;
  label: string;
  showText?: boolean;
  idleText?: string;
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
      {state === "ok" ? <Check className="size-4" aria-hidden /> : !showText && <Copy className="size-4" aria-hidden />}
      {showText && <span>{state === "ok" ? "Copied" : state === "fail" ? "Copy failed" : idleText}</span>}
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
    <button type="button" className={textBtn} onClick={onClick}>
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
