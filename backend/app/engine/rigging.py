import random
from dataclasses import dataclass
from typing import Literal, Sequence

from app.db.rows import EntryRow, Mode
from app.engine.names import normalize_name

RuleState = Literal["fair_mode", "active", "no_match", "all_excluded"]


@dataclass(frozen=True)
class RuleStatus:
    state: RuleState
    matched_target: str | None        # the target string exactly as the admin typed it
    matched_entry_ids: list[str]      # active entries that are X


@dataclass(frozen=True)
class PickResult:
    winner: EntryRow
    rule_applied: bool                # True only when state == "active"


def _resolve_target(active_entries: Sequence[EntryRow],
                    target_names: Sequence[str]) -> tuple[str | None, list[str]]:
    by_norm: dict[str, list[str]] = {}
    for e in active_entries:
        n = normalize_name(e.name)
        if n:
            by_norm.setdefault(n, []).append(e.id)
    for target in target_names:
        n = normalize_name(target)
        if not n:
            continue
        ids = by_norm.get(n)
        if ids:
            return target, list(ids)
    return None, []


def evaluate_rule(active_entries: Sequence[EntryRow], mode: Mode,
                  target_names: Sequence[str]) -> RuleStatus:
    matched_target, matched_ids = _resolve_target(active_entries, target_names)
    if mode == "fair":
        return RuleStatus("fair_mode", matched_target, matched_ids)
    if matched_target is None:
        return RuleStatus("no_match", None, [])
    if mode == "never" and len(matched_ids) == len(active_entries):
        return RuleStatus("all_excluded", matched_target, matched_ids)
    return RuleStatus("active", matched_target, matched_ids)


def pick_winner(active_entries: Sequence[EntryRow], mode: Mode,
                target_names: Sequence[str], rng: random.Random) -> PickResult:
    if not active_entries:
        raise ValueError("pick_winner requires at least one active entry")
    status = evaluate_rule(active_entries, mode, target_names)
    if status.state != "active":
        return PickResult(rng.choice(list(active_entries)), False)
    x_ids = set(status.matched_entry_ids)
    if mode == "always":
        pool = [e for e in active_entries if e.id in x_ids]
    else:  # never
        pool = [e for e in active_entries if e.id not in x_ids]
    return PickResult(rng.choice(pool), True)
