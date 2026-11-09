import { describe, expect, it } from "vitest";
import type { RuleStatus } from "../adminTypes";
import { ruleStatusText, scriptWaitingText } from "./RuleStatusBanner";

const base: RuleStatus = {
  state: "active",
  matched_target: "Jonas",
  matched_entry_ids: ["e1"],
  targets: [{ name: "Jonas", entry_ids: ["e1"] }],
  script_step: null,
  streak: 0,
  decider: "rule",
};
const always = { mode: "always" as const, chance: null, max_streak: null };

describe("the rule status line", () => {
  it("says how often the target wins", () => {
    expect(ruleStatusText(base, always)).toBe("Rigged: Jonas will ALWAYS win");
    expect(ruleStatusText(base, { ...always, chance: 25 })).toBe("Rigged: Jonas wins 25% of spins");
    expect(ruleStatusText(base, { ...always, mode: "never" })).toBe("Rigged: Jonas will NEVER win");
  });

  it("puts the script first", () => {
    const rs = { ...base, script_step: { name: "Mia", entry_ids: ["e2"] }, decider: "script" as const };
    expect(ruleStatusText(rs, always)).toBe("Script: Mia wins the next spin");
    expect(scriptWaitingText(rs)).toBeNull();
  });

  it("says when a script step waits for its name", () => {
    const rs = { ...base, script_step: { name: "Mia", entry_ids: [] } };
    expect(ruleStatusText(rs, always)).toBe("Rigged: Jonas will ALWAYS win");
    expect(scriptWaitingText(rs)).toContain("Mia");
  });

  it("says when the streak breaker has paused the rule", () => {
    const rs = { ...base, state: "streak_paused" as const, streak: 3, decider: "fair" as const };
    expect(ruleStatusText(rs, { ...always, max_streak: 3 })).toContain("won 3 in a row");
  });
});
