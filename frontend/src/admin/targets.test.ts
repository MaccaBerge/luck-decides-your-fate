import { describe, expect, it } from "vitest";
import { targetRanks, toggleTarget } from "./targets";

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
});
