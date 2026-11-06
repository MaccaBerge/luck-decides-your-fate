import { CircleAlert, CircleCheck } from "lucide-react";

export interface ToastMsg {
  id: number;
  text: string;
  kind: "error" | "info";
}

export function Toast({ toast }: { toast: ToastMsg | null }) {
  if (!toast) return null;
  const Icon = toast.kind === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      key={toast.id}
      role={toast.kind === "error" ? "alert" : "status"}
      className={`fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] animate-toast items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-[0_6px_20px_rgb(0_0_0/0.3)] ${
        toast.kind === "error"
          ? "bg-danger text-on-danger"
          : "bg-ink text-pad"
      }`}
      style={{ transform: "translateX(-50%)" }}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{toast.text}</span>
    </div>
  );
}
