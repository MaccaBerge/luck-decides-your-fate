import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteList, findListByName, MAX_LISTS, planLoad, readLists, saveList } from "./savedLists";

const KEY = "ldyf:savedLists";
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("reading", () => {
  it("is empty when nothing is saved", () => {
    expect(readLists()).toEqual([]);
  });

  it.each([
    ["not JSON", "{nope"],
    ["not an array", '{"a":1}'],
    ["wrong item type", "[1,2]"],
    ["missing fields", '[{"id":"a"}]'],
    ["names not strings", '[{"id":"a","name":"x","names":[1],"updatedAt":"t"}]'],
    ["name too long", JSON.stringify([{ id: "a", name: "x".repeat(41), names: ["A"], updatedAt: "t" }])],
    ["too many names", JSON.stringify([{ id: "a", name: "x", names: Array(101).fill("A"), updatedAt: "t" }])],
  ])("reads corrupt data as empty: %s", (_label, value) => {
    store.set(KEY, value);
    expect(readLists()).toEqual([]);
  });

  it("reads too many lists as empty", () => {
    const list = { id: "a", name: "x", names: ["A"], updatedAt: "t" };
    store.set(KEY, JSON.stringify(Array(MAX_LISTS + 1).fill(list)));
    expect(readLists()).toEqual([]);
  });
});

describe("saving", () => {
  it("stores a trimmed name and the names in order", () => {
    expect(saveList("  Friends ", ["B", "A"])).toEqual({ ok: true });
    const [l] = readLists();
    expect(l.name).toBe("Friends");
    expect(l.names).toEqual(["B", "A"]);
    expect(Object.keys(l).sort()).toEqual(["id", "name", "names", "updatedAt"]);
  });

  it("replaces a list with the same name, keeping one list", () => {
    saveList("Friends", ["A"]);
    const id = readLists()[0].id;
    expect(saveList("Friends", ["B", "C"])).toEqual({ ok: true });
    const lists = readLists();
    expect(lists).toHaveLength(1);
    expect(lists[0].id).toBe(id);
    expect(lists[0].names).toEqual(["B", "C"]);
    expect(findListByName(" Friends ")?.id).toBe(id);
  });

  it("treats a differently cased name as another list", () => {
    saveList("Friends", ["A"]);
    saveList("friends", ["B"]);
    expect(readLists()).toHaveLength(2);
  });

  it("stops at the list limit, but can still replace", () => {
    for (let i = 0; i < MAX_LISTS; i++) expect(saveList(`L${i}`, ["A"])).toEqual({ ok: true });
    expect(saveList("One more", ["A"])).toEqual({ ok: false, reason: "full" });
    expect(saveList("L3", ["B"])).toEqual({ ok: true });
    expect(readLists()).toHaveLength(MAX_LISTS);
  });

  it("keeps at most 100 names", () => {
    saveList("Big", Array.from({ length: 150 }, (_, i) => `N${i}`));
    expect(readLists()[0].names).toHaveLength(100);
  });

  it.each([
    ["empty list name", "   ", ["A"]],
    ["list name too long", "x".repeat(41), ["A"]],
    ["no names", "L", []],
    ["a name too long", "L", ["x".repeat(41)]],
  ])("rejects %s", (_label, name, names) => {
    expect(saveList(name, names)).toEqual({ ok: false, reason: "invalid" });
    expect(store.size).toBe(0);
  });

  it("deletes one list", () => {
    saveList("A", ["1"]);
    saveList("B", ["2"]);
    expect(deleteList(findListByName("A")!.id)).toBe(true);
    expect(readLists().map((l) => l.name)).toEqual(["B"]);
  });
});

describe("blocked storage", () => {
  beforeEach(() => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
  });

  it("doesn't throw", () => {
    expect(readLists()).toEqual([]);
    expect(findListByName("A")).toBeUndefined();
    expect(saveList("A", ["1"])).toEqual({ ok: false, reason: "storage" });
    expect(deleteList("x")).toBe(false);
  });
});

describe("planLoad", () => {
  it("skips names already on the wheel, by exact match only", () => {
    expect(planLoad(["Anna", "anna", "Ben"], ["Anna"], 100)).toEqual({ toAdd: ["anna", "Ben"], leftOut: 0 });
  });

  it("adds what fits and counts the rest", () => {
    expect(planLoad(["A", "B", "C", "D"], ["X", "Y"], 4)).toEqual({ toAdd: ["A", "B"], leftOut: 2 });
  });

  it("handles a full wheel", () => {
    expect(planLoad(["A"], ["X"], 1)).toEqual({ toAdd: [], leftOut: 1 });
  });
});
