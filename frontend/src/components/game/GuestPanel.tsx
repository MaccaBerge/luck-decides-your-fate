import type { RecentSpin } from "../../lib/types";
import { RecentSpins } from "./RecentSpins";
import { card } from "./buttons";

/** The side column for players who aren't the host: they watch, the host spins and edits. */
export function GuestPanel({ recentSpins, hostName }: { recentSpins: RecentSpin[]; hostName: string | null }) {
  return (
    <aside aria-label="Game" className="flex min-w-0 flex-col gap-4">
      <section className={`${card} flex flex-col gap-2 p-6`}>
        <h2 className="font-display text-[21px] font-semibold text-ink">You're in!</h2>
        <p className="text-sm leading-relaxed text-ink-muted">
          {hostName ? `${hostName} is the host` : "The host"} and spins the wheel. Keep this page open to watch it
          live.
        </p>
      </section>
      <RecentSpins spins={recentSpins} />
    </aside>
  );
}
