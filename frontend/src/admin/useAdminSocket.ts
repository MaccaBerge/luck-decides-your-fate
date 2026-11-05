import { useEffect, useRef } from "react";
import { openSocket } from "../lib/ws";
import type { AdminLinkEvent, DashboardEvent } from "./adminTypes";

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** Live dashboard updates from /ws/admin. Calls onUnauthorized on close code 4401. */
export function useDashboardSocket(
  onEvent: (e: DashboardEvent) => void,
  onUnauthorized: () => void,
) {
  const evRef = useLatest(onEvent);
  const unauthRef = useLatest(onUnauthorized);
  useEffect(() => {
    return openSocket<DashboardEvent>(
      "/ws/admin",
      (e) => evRef.current(e),
      (code) => {
        if (code === 4401) unauthRef.current();
      },
    );
  }, [evRef, unauthRef]);
}

/** Live link control updates from /ws/admin/games/{id}. */
export function useAdminLinkSocket(
  gameId: string | undefined,
  onEvent: (e: AdminLinkEvent) => void,
  handlers: { onUnauthorized: () => void; onNotFound: () => void },
) {
  const evRef = useLatest(onEvent);
  const hRef = useLatest(handlers);
  useEffect(() => {
    if (!gameId) return;
    return openSocket<AdminLinkEvent>(
      `/ws/admin/games/${encodeURIComponent(gameId)}`,
      (e) => evRef.current(e),
      (code) => {
        if (code === 4401) hRef.current.onUnauthorized();
        else if (code === 4404) hRef.current.onNotFound();
      },
    );
  }, [gameId, evRef, hRef]);
}
