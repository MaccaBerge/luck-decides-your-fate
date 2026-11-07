import type { PlayerEvent } from "./types";

export const wsUrl = (path: string) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;

const BACKOFF_MS = [1000, 2000, 5000];
const TERMINAL_CODES = new Set([4401, 4404]);
/** How long a tab can stay hidden before a pausing socket closes. */
export const HIDDEN_CLOSE_MS = 15_000;

export interface SocketOptions {
  /**
   * Close the socket once the tab has been hidden for HIDDEN_CLOSE_MS, and reconnect when it's
   * visible again. Closing this way never calls `onClose` or the backoff reconnect.
   */
  pauseWhenHidden?: boolean;
  /**
   * Add `?resume=1` to every connection after the first one that opened, so the server counts
   * one visit per page load. It's a flag, not an identifier.
   */
  markResumes?: boolean;
}

const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/**
 * Open a server→client JSON WebSocket. Auto-reconnects with backoff 1s, 2s, 5s (max).
 * Never reconnects after close codes 4401/4404 or after a {"type":"game_deleted"} event.
 * `onClose` is called with the close code on every close (except after dispose or a pause).
 * Returns a disposer.
 */
export function openSocket<T>(
  path: string,
  onEvent: (e: T) => void,
  onClose?: (code: number) => void,
  options: SocketOptions = {},
): () => void {
  let ws: WebSocket | null = null;
  let disposed = false;
  let stop = false;
  let paused = false;
  let opened = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  /** Close the current socket without reporting it (dispose and pause). */
  const closeQuietly = () => {
    if (!ws) return;
    ws.onclose = null;
    ws.onmessage = null;
    if (ws.readyState === WebSocket.CONNECTING) {
      const s = ws;
      s.onopen = () => s.close(1000);
    } else {
      ws.close(1000);
    }
    ws = null;
  };

  const connect = () => {
    timer = null;
    if (disposed || paused) return;
    const url = options.markResumes && opened ? `${path}${path.includes("?") ? "&" : "?"}resume=1` : path;
    ws = new WebSocket(wsUrl(url));
    ws.onopen = () => {
      attempt = 0;
      opened = true;
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

  const pause = () => {
    hideTimer = null;
    if (disposed || stop) return;
    paused = true;
    if (timer) clearTimeout(timer);
    timer = null;
    closeQuietly();
  };

  const onVisibility = () => {
    if (isHidden()) {
      if (!hideTimer && !paused) hideTimer = setTimeout(pause, HIDDEN_CLOSE_MS);
      return;
    }
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (paused) {
      paused = false;
      attempt = 0;
      connect();
    }
  };

  const watchVisibility = options.pauseWhenHidden && typeof document !== "undefined";
  if (watchVisibility) document.addEventListener("visibilitychange", onVisibility);

  connect();
  if (watchVisibility && isHidden()) onVisibility(); // opened in a background tab

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (hideTimer) clearTimeout(hideTimer);
    if (watchVisibility) document.removeEventListener("visibilitychange", onVisibility);
    closeQuietly();
  };
}

/** The wheel page's socket: it pauses while the tab is hidden and marks reconnects as resumes. */
export const connectGameSocket = (
  gameId: string,
  onEvent: (e: PlayerEvent) => void,
  onClose?: (code: number) => void,
) =>
  openSocket<PlayerEvent>(`/ws/games/${encodeURIComponent(gameId)}`, onEvent, onClose, {
    pauseWhenHidden: true,
    markResumes: true,
  });
