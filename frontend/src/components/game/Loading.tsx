import { WheelMark } from "./WheelMark";

export function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy="true">
      <WheelMark className="size-14 animate-[spin_1.6s_linear_infinite]" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
