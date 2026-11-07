/**
 * Lets browser tabs ask each other whether a wheel is already open, so a new tab on "/" can start a
 * new wheel instead of reopening the one another tab is showing. Nothing leaves the browser.
 */
const CHANNEL = "ldyf:open-wheels";

type Message = { type: "ask"; gameId: string; nonce: string } | { type: "open"; nonce: string };

function openChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

/** Answer other tabs that ask about `gameId`. Returns a function that stops answering. */
export function announceOpenWheel(gameId: string): () => void {
  const channel = openChannel();
  if (!channel) return () => {};
  channel.onmessage = (e: MessageEvent<Message>) => {
    const msg = e.data;
    if (msg?.type === "ask" && msg.gameId === gameId) channel.postMessage({ type: "open", nonce: msg.nonce });
  };
  return () => channel.close();
}

/** Resolves true if another tab answers within `timeoutMs` that it has `gameId` open. */
export function isWheelOpenElsewhere(gameId: string, timeoutMs = 150): Promise<boolean> {
  const channel = openChannel();
  if (!channel) return Promise.resolve(false);
  const nonce = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    const done = (open: boolean) => {
      clearTimeout(timer);
      channel.close();
      resolve(open);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    channel.onmessage = (e: MessageEvent<Message>) => {
      if (e.data?.type === "open" && e.data.nonce === nonce) done(true);
    };
    channel.postMessage({ type: "ask", gameId, nonce } satisfies Message);
  });
}
