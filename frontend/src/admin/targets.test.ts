import { describe, expect, it } from "vitest";
import { sortByTarget, targetRanks, toggleTarget } from "./targets";

const targets = [
  { name: "Erik", entry_ids: [] },
  { name: "jonas", entry_ids: ["e2", "e3"] },
  { name: "Anna", entry_ids: ["e1"] },
  { name: "JONAS", entry_ids: ["e2", "e3"] },
];

describe("click-to-target", () => {
  it("ranks each matched entry by its first target", () => {
    expect([...targetRanks(targets)]).toEqual([
      ["e2", 2],
      ["e3", 2],
      ["e1", 3],
    ]);
  });

  it("adds an untargeted name at the end", () => {
    expect(toggleTarget(targets, { id: "e4", name: "Mia" })).toEqual(["Erik", "jonas", "Anna", "JONAS", "Mia"]);
    expect(toggleTarget([], { id: "e4", name: "Mia" })).toEqual(["Mia"]);
  });

  it("removes every target that matches the clicked entry, using the server's matches", () => {
    expect(toggleTarget(targets, { id: "e3", name: "Jonas!" })).toEqual(["Erik", "Anna"]);
    expect(toggleTarget(targets, { id: "e1", name: "Anna" })).toEqual(["Erik", "jonas", "JONAS"]);
  });

  it("sorts targets first by priority, then the rest in wheel order", () => {
    const entries = ["e0", "e1", "e2", "e3", "e4", "e5"].map((id) => ({ id }));
    const ranks = new Map([
      ["e4", 1],
      ["e1", 2],
      ["e5", 2],
    ]);
    expect(sortByTarget(entries, ranks).map((e) => e.id)).toEqual(["e4", "e1", "e5", "e0", "e2", "e3"]);
    expect(sortByTarget(entries, new Map()).map((e) => e.id)).toEqual(["e0", "e1", "e2", "e3", "e4", "e5"]);
    expect(entries.map((e) => e.id)).toEqual(["e0", "e1", "e2", "e3", "e4", "e5"]); // input untouched
  });
});
