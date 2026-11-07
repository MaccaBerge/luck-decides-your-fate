/**
 * The last multiplayer game this browser was in, so the wheel page can offer to go back to it
 * while it's still going (also after leaving it, or closing the site). Stored in local storage.
 */
export interface RecentGame {
  gameId: string;
  code: string;
}

const KEY = "ldyf:recentGame";

export function getRecentGame(): RecentGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<RecentGame>;
    return typeof v.gameId === "string" && typeof v.code === "string" ? { gameId: v.gameId, code: v.code } : null;
  } catch {
    return null;
  }
}

export function setRecentGame(g: RecentGame) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* ignore */
  }
}

export function clearRecentGame() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
