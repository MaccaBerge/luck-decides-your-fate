import { useEffect, useState } from "react";

/** The code and a QR code, for big-screen mode on a TV: people join from their phones. */
export function InviteCard({ code, url, players }: { code: string; url: string; players: number }) {
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

  return (
    <div
      data-testid="invite-card"
      className="fixed top-3 left-3 z-40 flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-4 text-ink max-sm:hidden"
    >
      {src && <img src={src} alt="QR code to join this game" className="size-24 rounded-lg bg-white lg:size-32" />}
      <div className="flex flex-col">
        <span className="text-xs font-medium text-ink-muted">Join with the code</span>
        <span className="font-display text-[28px] leading-tight font-semibold tracking-[0.12em] lg:text-[36px]">{code}</span>
        <span className="text-xs text-ink-muted">
          {players} {players === 1 ? "player" : "players"}
        </span>
      </div>
    </div>
  );
}
