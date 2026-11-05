import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLastGameId, getLastGameId, readPref, setLastGameId } from "./storage";

describe("storage key migration", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("moves a legacy value to the new key on first read", () => {
    store.set("theme", "dark");
    expect(readPref("ldyf:theme", "theme")).toBe("dark");
    expect(store.get("ldyf:theme")).toBe("dark");
    expect(store.has("theme")).toBe(false);
  });

  it("prefers the new key over a legacy value", () => {
    store.set("theme", "dark");
    store.set("ldyf:theme", "light");
    expect(readPref("ldyf:theme", "theme")).toBe("light");
  });

  it("returns null when neither key exists", () => {
    expect(readPref("ldyf:theme", "theme")).toBeNull();
  });

  it("writes only the new lastGameId key, and clears both", () => {
    setLastGameId("abc");
    expect(store.get("ldyf:lastGameId")).toBe("abc");
    expect(store.has("lastGameId")).toBe(false);
    store.set("lastGameId", "old");
    clearLastGameId();
    expect(getLastGameId()).toBeNull();
  });
});
