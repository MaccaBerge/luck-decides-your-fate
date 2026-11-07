import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  /** The QR image (a data URL). */
  src: string;
  code: string;
  /** The small QR it grows out of and shrinks back into. */
  from: RefObject<HTMLElement | null>;
  onClose: () => void;
}

const DURATION_MS = 320;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Where the big QR sits (its centre) and how big it is, for the current window. */
function layout() {
  const size = Math.min(window.innerWidth * 0.82, window.innerHeight * 0.66, 480);
  return { size, cx: window.innerWidth / 2, cy: window.innerHeight / 2 - 28 };
}

/** The transform that makes the big QR cover the small one exactly. */
function collapsed(from: HTMLElement | null): string {
  const { size, cx, cy } = layout();
  const r = from?.getBoundingClientRect();
  if (!r || r.width === 0) return "translate(-50%, -50%) scale(0.2)";
  const dx = r.left + r.width / 2 - cx;
  const dy = r.top + r.height / 2 - cy;
  return `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${r.width / size})`;
}

/**
 * The host's QR code, enlarged in the middle of the screen. It grows out of the small code on the
 * invite card and shrinks back into it when closed (a fade only, with reduced motion).
 */
export function QrZoom({ src, code, from, onClose }: Props) {
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [open, setOpen] = useState(false); // false: drawn on top of the small QR
  const [closing, setClosing] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [, setResized] = useState(0);

  const imgRef = useRef<HTMLImageElement>(null);

  // Start collapsed over the small QR, then grow. Reading the layout makes the browser apply the
  // collapsed position first; a timer (not requestAnimationFrame, which background tabs pause)
  // then starts the transition.
  useLayoutEffect(() => {
    if (reduce) {
      setOpen(true);
      return;
    }
    imgRef.current?.getBoundingClientRect();
    const t = setTimeout(() => setOpen(true), 16);
    return () => clearTimeout(t);
  }, [reduce]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setOpen(false);
    setTimeout(() => onCloseRef.current(), reduce ? 150 : DURATION_MS);
  };
  const closeLatest = useRef(close);
  closeLatest.current = close;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeLatest.current();
      }
    };
    const onResize = () => setResized((n) => n + 1);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      prev?.focus?.();
    };
  }, []);

  const { size, cx, cy } = layout();
  const transition = reduce ? "opacity 150ms ease-out" : `transform ${DURATION_MS}ms ${EASE}, opacity ${DURATION_MS}ms ${EASE}`;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="QR code" className="fixed inset-0 z-50" onClick={close}>
      <div
        className="absolute inset-0 bg-scrim"
        style={{ opacity: open ? 1 : 0, transition: `opacity ${reduce ? 150 : DURATION_MS}ms ${EASE}` }}
      />
      <img
        ref={imgRef}
        src={src}
        alt={`QR code to join with the code ${code}`}
        className="absolute rounded-3xl bg-white shadow-[0_24px_60px_var(--segment-shadow)]"
        style={{
          left: cx,
          top: cy,
          width: size,
          height: size,
          transform: open || reduce ? "translate(-50%, -50%)" : collapsed(from.current),
          opacity: reduce && !open ? 0 : 1,
          transition,
        }}
      />
      <p
        className="absolute -translate-x-1/2 rounded-2xl bg-surface px-6 py-2 text-center text-ink"
        style={{ left: cx, top: cy + size / 2 + 16, opacity: open ? 1 : 0, transition: `opacity ${DURATION_MS}ms ${EASE}` }}
      >
        <span className="block text-sm font-medium text-ink-muted">Join with the code</span>
        <span className="font-display text-[34px] leading-tight font-semibold tracking-[0.14em]">{code}</span>
      </p>
      <button
        ref={closeRef}
        type="button"
        aria-label="Close QR code"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full bg-surface text-ink"
        style={{ opacity: open ? 1 : 0, transition: `opacity ${DURATION_MS}ms ${EASE}` }}
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
