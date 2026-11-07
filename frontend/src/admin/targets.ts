import type { RuleTarget } from "./adminTypes";

/**
 * Click-to-target helpers. Which entries a target matches always comes from the server
 * (`rule_status.targets`); the browser never compares names itself.
 */

/** Entry ID -> its priority (1 = first) among the targets that match it. */
export function targetRanks(targets: RuleTarget[]): Map<string, number> {
  const ranks = new Map<string, number>();
  targets.forEach((t, i) => {
    for (const id of t.entry_ids) if (!ranks.has(id)) ranks.set(id, i + 1);
  });
  return ranks;
}

/**
 * The new `target_names` after clicking an entry: if any target matches it, those targets are
 * removed; otherwise its name is added at the end (lowest priority).
 */
export function toggleTarget(targets: RuleTarget[], entry: { id: string; name: string }): string[] {
  const matching = targets.filter((t) => t.entry_ids.includes(entry.id));
  if (matching.length > 0) return targets.filter((t) => !matching.includes(t)).map((t) => t.name);
  return [...targets.map((t) => t.name), entry.name];
}
