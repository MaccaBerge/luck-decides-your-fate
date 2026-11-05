const LAST_GAME = "ldyf:lastGameId";
const LEGACY_LAST_GAME = "lastGameId";

/** Read a stored value. A value under `legacyKey` is moved to `key` the first time it's read. */
export function readPref(key: string, legacyKey: string): string | null {
  try {
    const value = localStorage.getItem(key);
    if (value !== null) return value;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return null;
    localStorage.setItem(key, legacy);
    localStorage.removeItem(legacyKey);
    return legacy;
  } catch {
    return null;
  }
}

export function getLastGameId(): string | null {
  return readPref(LAST_GAME, LEGACY_LAST_GAME);
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
    localStorage.removeItem(LEGACY_LAST_GAME);
  } catch {
    /* ignore */
  }
}
