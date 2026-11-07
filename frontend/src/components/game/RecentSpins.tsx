import { ChevronDown } from "lucide-react";
import type { RecentSpin } from "../../lib/types";
import { card } from "./buttons";

/** Just the time for today's spins; older ones also need the date. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const time: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], time)
    : d.toLocaleString([], { ...time, day: "numeric", month: "short" });
}

export function RecentSpins({ spins }: { spins: RecentSpin[] }) {
  return (
    <details data-testid="recent-spins" className={`${card} group min-w-0 px-6`}>
      <summary className="flex min-h-[58px] cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        Recent spins
        <ChevronDown className="size-4 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      {spins.length === 0 ? (
        <p className="pb-4 text-sm text-ink-muted">No spins yet.</p>
      ) : (
        <ol className="flex flex-col pb-2">
          {spins.map((s) => (
            <li key={s.spin_id} className="flex min-h-11 items-center justify-between gap-4 border-t border-divider py-2 text-sm">
              <span title={s.winner_name} className="min-w-0 truncate font-medium text-ink">
                {s.winner_name}
              </span>
              <time dateTime={s.finished_at} className="shrink-0 text-ink-muted">
                {formatTime(s.finished_at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
