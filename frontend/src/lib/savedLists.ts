/** Name lists saved in this browser only. Names reach the server only when a list is loaded onto a wheel. */

const KEY = "ldyf:savedLists";
export const MAX_LISTS = 20;
export const MAX_LIST_NAMES = 100;
export const MAX_NAME_LENGTH = 40;

export interface SavedList {
  id: string;
  name: string;
  names: string[];
  updatedAt: string;
}

export type SaveResult = { ok: true } | { ok: false; reason: "invalid" | "full" | "storage" };

const validName = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_NAME_LENGTH;

function isSavedList(v: unknown): v is SavedList {
  if (typeof v !== "object" || v === null) return false;
  const l = v as Partial<SavedList>;
  return (
    typeof l.id === "string" &&
    validName(l.name) &&
    typeof l.updatedAt === "string" &&
    Array.isArray(l.names) &&
    l.names.length <= MAX_LIST_NAMES &&
    l.names.every(validName)
  );
}

/** Newest first. Missing, corrupt or blocked storage reads as no lists. */
export function readLists(): SavedList[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed) || parsed.length > MAX_LISTS || !parsed.every(isSavedList)) return [];
    return [...parsed].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function write(lists: SavedList[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(lists));
    return true;
  } catch {
    return false;
  }
}

export function findListByName(name: string): SavedList | undefined {
  const wanted = name.trim();
  return readLists().find((l) => l.name === wanted);
}

/** Saving under an existing name replaces that list. */
export function saveList(name: string, names: string[]): SaveResult {
  const trimmed = name.trim();
  const kept = names.slice(0, MAX_LIST_NAMES);
  if (!validName(trimmed) || kept.length === 0 || !kept.every(validName)) return { ok: false, reason: "invalid" };
  const lists = readLists();
  const existing = lists.find((l) => l.name === trimmed);
  if (!existing && lists.length >= MAX_LISTS) return { ok: false, reason: "full" };
  const saved: SavedList = {
    id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    names: kept,
    updatedAt: new Date().toISOString(),
  };
  const ok = write([saved, ...lists.filter((l) => l !== existing)]);
  return ok ? { ok: true } : { ok: false, reason: "storage" };
}

export function deleteList(id: string): boolean {
  return write(readLists().filter((l) => l.id !== id));
}

/** Which names to add: those not already on the wheel (exact match), as many as fit. */
export function planLoad(names: string[], onWheel: string[], maxEntries: number): { toAdd: string[]; leftOut: number } {
  const present = new Set(onWheel);
  const fresh = names.filter((n) => !present.has(n));
  const room = Math.max(0, maxEntries - onWheel.length);
  return { toAdd: fresh.slice(0, room), leftOut: Math.max(0, fresh.length - room) };
}
