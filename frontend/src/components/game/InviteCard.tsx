import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { card } from "./buttons";

interface Props {
  code: string;
  url: string;
  players: number;
  /** "floating": a corner card for big-screen mode. "panel": a card in the host's side column. */
  variant?: "floating" | "panel";
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

/** The code and a QR code, so people can join from their phones. */
export function InviteCard({ code, url, players, variant = "floating" }: Props) {
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
  return (
    <div
      data-testid={panel ? "host-invite-card" : "invite-card"}
      className={
        panel
          ? `${card} flex items-center gap-4 p-5`
          : "fixed top-3 left-3 z-40 flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-4 text-ink max-sm:hidden"
      }
    >
      <div className={`shrink-0 overflow-hidden rounded-lg bg-white ${panel ? "size-28" : "size-24 lg:size-32"}`}>
        {src && <img src={src} alt="QR code to join this game" className="size-full" />}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-ink-muted">Join with the code</span>
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
        <span className="text-xs text-ink-muted">
          {players} {players === 1 ? "player" : "players"}
        </span>
      </div>
    </div>
  );
}
