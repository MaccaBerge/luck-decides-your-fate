import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Accessible modal dialog: role="dialog", aria-modal, Escape + backdrop close, focus trap-lite. */
export function Modal({ open, onClose, label, children, className = "", style }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ??
      el?.querySelector<HTMLElement>("button, textarea, input, [tabindex]:not([tabindex='-1'])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab" && el) {
        const items = Array.from(
          el.querySelectorAll<HTMLElement>("button:not([disabled]), textarea, input, [tabindex]:not([tabindex='-1'])"),
        );
        if (items.length === 0) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-[#0b1f19]/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={style}
        className={`w-full animate-pop rounded-md shadow-[0_12px_40px_rgb(0_0_0/0.35)] ${className || "max-w-md bg-pad p-6 text-ink"}`}
      >
        {children}
      </div>
    </div>
  );
}
