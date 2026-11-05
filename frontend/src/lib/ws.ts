import type { PlayerEvent } from "./types";

export const wsUrl = (path: string) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;

const BACKOFF_MS = [1000, 2000, 5000];
const TERMINAL_CODES = new Set([4401, 4404]);

/**
 * Open a server→client JSON WebSocket. Auto-reconnects with backoff 1s, 2s, 5s (max).
 * Never reconnects after close codes 4401/4404 or after a {"type":"game_deleted"} event.
 * `onClose` is called with the close code on every close (except after dispose).
 * Returns a disposer.
 */
export function openSocket<T>(
  path: string,
  onEvent: (e: T) => void,
  onClose?: (code: number) => void,
): () => void {
  let ws: WebSocket | null = null;
  let disposed = false;
  let stop = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (disposed) return;
    ws = new WebSocket(wsUrl(path));
    ws.onopen = () => {
      attempt = 0;
    };
    ws.onmessage = (msg) => {
      if (disposed) return;
      let data: unknown;
      try {
        data = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      if (data && typeof data === "object" && (data as { type?: unknown }).type === "game_deleted") {
        stop = true;
      }
      onEvent(data as T);
    };
    ws.onclose = (ev) => {
      ws = null;
      if (disposed) return;
      if (TERMINAL_CODES.has(ev.code)) stop = true;
      onClose?.(ev.code);
      if (stop) return;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt++;
      timer = setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      if (ws.readyState === WebSocket.CONNECTING) {
        const s = ws;
        s.onopen = () => s.close(1000);
      } else {
        ws.close(1000);
      }
      ws = null;
    }
  };
}

export const connectGameSocket = (
  gameId: string,
  onEvent: (e: PlayerEvent) => void,
  onClose?: (code: number) => void,
) => openSocket<PlayerEvent>(`/ws/games/${encodeURIComponent(gameId)}`, onEvent, onClose);
