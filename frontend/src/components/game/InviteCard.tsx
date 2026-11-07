import { useEffect, useState } from "react";
import { card } from "./buttons";

interface Props {
  code: string;
  url: string;
  players: number;
  /** "floating": a corner card for big-screen mode. "panel": a card in the host's side column. */
  variant?: "floating" | "panel";
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
        <span
          className={`font-display leading-tight font-semibold tracking-[0.12em] text-ink ${
            panel ? "text-[30px]" : "text-[28px] lg:text-[36px]"
          }`}
        >
          {code}
        </span>
        <span className="text-xs text-ink-muted">
          {players} {players === 1 ? "player" : "players"}
        </span>
      </div>
    </div>
  );
}
