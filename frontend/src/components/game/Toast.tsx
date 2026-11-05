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
      className={`fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] animate-toast items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-xl ${
        toast.kind === "error"
          ? "bg-red-600 text-white"
          : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
      }`}
      style={{ transform: "translateX(-50%)" }}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{toast.text}</span>
    </div>
  );
}
