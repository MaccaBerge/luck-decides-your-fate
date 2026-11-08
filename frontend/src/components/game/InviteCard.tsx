import { useEffect, useRef, useState } from "react";
import { Check, Copy, Lock } from "lucide-react";
import { QrZoom } from "./QrZoom";
import type { JoinPolicy } from "../../lib/types";
import { card } from "./buttons";

interface Props {
  code: string;
  url: string;
  /** "floating": a corner card for big-screen mode. "panel": a card in the host's side column. */
  variant?: "floating" | "panel";
  /** Who can join. "closed" hides the QR code and code. */
  policy?: JoinPolicy;
  /** The host's "Who can join" choice (panel only). */
  onPolicyChange?: (policy: JoinPolicy) => void;
  policyBusy?: boolean;
}

/** Copy text: the Clipboard API where allowed, else the older copy command. True if it worked. */
async function copyText(text: string): Promise<boolean> {
  try {
    // Some browsers leave the request waiting on a permission prompt; don't wait forever.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 1000));
    await Promise.race([navigator.clipboard.writeText(text), timeout]);
    return true;
  } catch {
    /* blocked, missing or no answer: try the fallback */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/** The code and a QR code, so people can join from their own devices. */
export function InviteCard({ code, url, variant = "floating", policy = "open", onPolicyChange, policyBusy = false }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((qr) => qr.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 320, color: { dark: "#000000", light: "#FFFFFF" } }))
      .then((s) => alive && setSrc(s))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [url]);

  const panel = variant === "panel";
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const codeRef = useRef<HTMLSpanElement>(null);
  const qrRef = useRef<HTMLButtonElement>(null);
  const [zoomed, setZoomed] = useState(false);

  const copyCode = async () => {
    if (!(await copyText(code))) {
      // Copying isn't allowed here: select the code so Cmd/Ctrl+C works.
      const el = codeRef.current;
      const sel = window.getSelection();
      if (el && sel) {
        sel.selectAllChildren(el);
      }
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  };
  const closed = policy === "closed";

  const qrAndCode = (
    <>
      {panel ? (
        <button
          ref={qrRef}
          type="button"
          aria-label="Enlarge QR code"
          title="Enlarge QR code"
          disabled={!src}
          onClick={() => setZoomed(true)}
          // Hidden while enlarged, so the big code looks like this one moving.
          className={`size-28 shrink-0 cursor-zoom-in overflow-hidden rounded-lg bg-white transition-transform hover:scale-[1.03] ${zoomed ? "invisible" : ""}`}
        >
          {src && <img src={src} alt="" className="size-full" />}
        </button>
      ) : (
        <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-white lg:size-32">
          {src && <img src={src} alt="QR code to join this game" className="size-full" />}
        </div>
      )}
      {zoomed && src && <QrZoom src={src} code={code} from={qrRef} onClose={() => setZoomed(false)} />}
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-ink-muted">
          {policy === "ask" ? "Ask to join with the code" : "Join with the code"}
        </span>
        <span className="flex items-center gap-1">
          <span
            ref={codeRef}
            className={`font-display leading-tight font-semibold tracking-[0.12em] text-ink ${
              panel ? "text-[30px]" : "text-[28px] lg:text-[36px]"
            }`}
          >
            {code}
          </span>
          {panel && (
            <button
              type="button"
              aria-label={copied ? "Code copied" : "Copy code"}
              title={copied ? "Copied" : "Copy code"}
              onClick={() => void copyCode()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-tint hover:text-ink"
            >
              {copied ? (
                <Check className="size-[18px] text-primary-strong" aria-hidden="true" />
              ) : (
                <Copy className="size-[18px]" aria-hidden="true" />
              )}
            </button>
          )}
        </span>
      </div>
    </>
  );

  // With "Nobody can join", the code is hidden: it would only invite people who can't get in.
  const closedNote = (
    <p data-testid="game-closed" className="flex items-center gap-2 py-1 text-sm font-medium text-ink">
      <Lock className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      Closed to new players
    </p>
  );

  return (
    <div
      data-testid={panel ? "host-invite-card" : "invite-card"}
      className={
        panel
          ? // Shares its view-transition name with the big-screen card, so one glides into the other.
            `${card} flex flex-col gap-4 p-5 [view-transition-name:invite-card]`
          : "fixed top-3 left-3 z-40 flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-4 text-ink max-sm:hidden [view-transition-name:invite-card]"
      }
    >
      {closed ? closedNote : panel ? <div className="flex items-center gap-4">{qrAndCode}</div> : qrAndCode}
      {panel && onPolicyChange && (
        <div className="flex flex-col gap-1.5">
          <span id="who-can-join" className="text-xs font-medium text-ink-muted">
            Who can join
          </span>
          <div role="radiogroup" aria-labelledby="who-can-join" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-tint p-1">
            {POLICIES.map((o) => {
              const checked = policy === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={policyBusy}
                  onClick={() => !checked && onPolicyChange(o.value)}
                  className={`h-8 rounded-lg px-2 text-[13px] font-medium transition-colors disabled:opacity-60 ${
                    checked ? "bg-surface text-ink shadow-[0_1px_2px_var(--segment-shadow)]" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const POLICIES: { value: JoinPolicy; label: string }[] = [
  { value: "open", label: "Anyone" },
  { value: "ask", label: "Must ask" },
  { value: "closed", label: "Nobody" },
];
