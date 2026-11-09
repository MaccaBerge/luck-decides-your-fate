import { describe, expect, it } from "vitest";
import { friendsToText, textToFriends } from "./FriendsPage";
import { wheelRuleText } from "./DashboardPage";
import type { WheelSummary } from "./adminTypes";

describe("the friends list as text", () => {
  it("is one friend per line, names separated by commas", () => {
    const friends = textToFriends("Jonas, Jonny\n\n  Mia  \n, ,\nMarcus,Macca,");
    expect(friends).toEqual([["Jonas", "Jonny"], ["Mia"], ["Marcus", "Macca"]]);
    expect(friendsToText(friends)).toBe("Jonas, Jonny\nMia\nMarcus, Macca");
  });
});

describe("what decides a wheel", () => {
  const w = (over: Partial<WheelSummary>): WheelSummary => ({
    id: "g",
    path: "/g/g",
    names: [],
    entry_count: 0,
    open_now: false,
    viewers: 0,
    spinning: false,
    created_at: "",
    last_activity_at: "",
    control: { source: "none", friends: [], matched: false },
    mode: "fair",
    chance: null,
    script: [],
    ...over,
  });

  it("names the rule and where it comes from", () => {
    expect(wheelRuleText(w({}))).toBe("Fair");
    expect(wheelRuleText(w({ mode: "always", chance: 40, control: { source: "standing", friends: ["A", "B"], matched: true } }))).toBe(
      "Always 40% (standing rule)",
    );
    expect(wheelRuleText(w({ mode: "never", control: { source: "own", friends: [], matched: false }, script: ["Mia", "Per"] }))).toBe(
      "Never (own rule) · Next: Mia +1",
    );
  });
});

describe("whether a wheel is in use", () => {
  it("says so before you delete it", async () => {
    const { wheelStatus } = await import("./DashboardPage");
    expect(wheelStatus({ spinning: true, viewers: 1 })).toEqual({ text: "Spinning now", busy: true });
    expect(wheelStatus({ spinning: false, viewers: 2 })).toEqual({ text: "In use: 2 open", busy: true });
    expect(wheelStatus({ spinning: false, viewers: 0 })).toEqual({ text: "Not open", busy: false });
  });
});
