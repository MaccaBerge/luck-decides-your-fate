import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRecentGame, getRecentGame, setRecentGame } from "./recentGame";

describe("recent game", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("remembers one game and forgets it", () => {
    expect(getRecentGame()).toBeNull();
    setRecentGame({ gameId: "abc", code: "ACP7KY" });
    setRecentGame({ gameId: "def", code: "DDVMNG" });
    expect(getRecentGame()).toEqual({ gameId: "def", code: "DDVMNG" });
    clearRecentGame();
    expect(getRecentGame()).toBeNull();
  });

  it("ignores junk and works without storage", () => {
    localStorage.setItem("ldyf:recentGame", "{nope");
    expect(getRecentGame()).toBeNull();
    vi.stubGlobal("localStorage", undefined);
    expect(getRecentGame()).toBeNull();
    expect(() => setRecentGame({ gameId: "a", code: "B" })).not.toThrow();
  });
});
