const LAST_GAME = "lastGameId";
export function getLastGameId(): string | null {
  try {
    return localStorage.getItem(LAST_GAME);
  } catch {
    return null;
  }
}
export function setLastGameId(id: string) {
  try {
    localStorage.setItem(LAST_GAME, id);
  } catch {
    /* ignore */
  }
}
export function clearLastGameId() {
  try {
    localStorage.removeItem(LAST_GAME);
  } catch {
    /* ignore */
  }
}
