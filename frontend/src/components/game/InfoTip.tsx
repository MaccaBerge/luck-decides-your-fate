import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

interface Props {
  /** Accessible name of the button, e.g. "About playing together". */
  label: string;
  children: ReactNode;
}

/**
 * A small ⓘ button that shows a short explanation in a bubble. Opens on click or tap (phones
 * can't hover); closes on a second click, a click elsewhere, or Escape (without closing a
 * surrounding dialog).
 */
export function InfoTip({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation(); // close the bubble, not the dialog around it
            e.nativeEvent.stopImmediatePropagation();
            setOpen(false);
          }
        }}
        className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-tint hover:text-ink"
      >
        <Info className="size-[18px]" aria-hidden="true" />
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute top-full left-1/2 z-10 mt-1.5 w-64 max-w-[calc(100vw-4rem)] -translate-x-1/2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm leading-relaxed font-normal text-ink-muted shadow-[0_8px_24px_var(--segment-shadow)]"
        >
          {children}
        </span>
      )}
    </span>
  );
}
