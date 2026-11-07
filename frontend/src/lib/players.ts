/**
 * Which player this browser is in each multiplayer game: the player's ID and the random key the
 * server gave when they joined (the privacy page mentions it). Stored per game in local storage.
 */
export interface Me {
  playerId: string;
  token: string;
}

const key = (gameId: string) => `ldyf:player:${gameId}`;

export function getMe(gameId: string): Me | null {
  try {
    const raw = localStorage.getItem(key(gameId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Me>;
    return typeof v.playerId === "string" && typeof v.token === "string" ? { playerId: v.playerId, token: v.token } : null;
  } catch {
    return null;
  }
}

export function setMe(gameId: string, me: Me) {
  try {
    localStorage.setItem(key(gameId), JSON.stringify(me));
  } catch {
    /* private window: you stay joined until the page reloads */
  }
}

export function clearMe(gameId: string) {
  try {
    localStorage.removeItem(key(gameId));
  } catch {
    /* ignore */
  }
}
