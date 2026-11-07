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

/**
 * Targets first, highest priority first, then everyone else. Ties (two entries matching the
 * same target) and untargeted names keep the wheel's order.
 */
export function sortByTarget<T extends { id: string }>(entries: T[], ranks: Map<string, number>): T[] {
  const rank = (e: T) => ranks.get(e.id) ?? Infinity;
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
    .map(({ e }) => e);
}
