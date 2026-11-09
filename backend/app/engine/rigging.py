import random
from dataclasses import dataclass
from typing import Literal, Sequence

from app.db.rows import EntryRow, Mode
from app.engine.names import normalize_name

# streak_paused: "always" X has won max_streak spins in a row, so spins are fair until someone
# else wins (the streak breaker).
RuleState = Literal["fair_mode", "active", "no_match", "all_excluded", "streak_paused"]
# What decides the next spin: a script step, the rule, or nothing (fair).
Decider = Literal["script", "rule", "fair"]


@dataclass(frozen=True)
class RuleStatus:
    state: RuleState
    matched_target: str | None        # the target string exactly as the admin typed it
    matched_entry_ids: list[str]      # active entries that are X
    # Every target in priority order, with the active entries it matches (possibly none).
    # Lets the controller UI show and toggle targets without matching names itself.
    targets: tuple[tuple[str, tuple[str, ...]], ...] = ()
    # The script's first step and the active entries it matches (none: it waits for that name).
    script_step: tuple[str, tuple[str, ...]] | None = None
    streak: int = 0                   # spins in a row X has won, newest first (always mode)
    decider: Decider = "fair"


@dataclass(frozen=True)
class PickResult:
    winner: EntryRow
    rule_applied: bool                # the script or the rule decided this spin
    used_script_step: bool = False    # the script's first step decided it: remove that step


def _target_matches(active_entries: Sequence[EntryRow],
                    target_names: Sequence[str]) -> tuple[tuple[str, tuple[str, ...]], ...]:
    by_norm: dict[str, list[str]] = {}
    for e in active_entries:
        n = normalize_name(e.name)
        if n:
            by_norm.setdefault(n, []).append(e.id)
    return tuple(
        (target, tuple(by_norm.get(normalize_name(target), ()) if normalize_name(target) else ()))
        for target in target_names
    )


def _resolve_target(targets: tuple[tuple[str, tuple[str, ...]], ...]) -> tuple[str | None, list[str]]:
    """The first target in priority order that matches an active entry."""
    for target, ids in targets:
        if ids:
            return target, list(ids)
    return None, []


def _streak(matched_target: str | None, recent_winners: Sequence[str]) -> int:
    """How many of the newest finished spins in a row X won (matched by name, like targets)."""
    if matched_target is None:
        return 0
    x = normalize_name(matched_target)
    n = 0
    for name in recent_winners:
        if normalize_name(name) != x:
            break
        n += 1
    return n


def _script_step(active_entries: Sequence[EntryRow], script: Sequence[str]) -> tuple[str, tuple[str, ...]] | None:
    if not script:
        return None
    return _target_matches(active_entries, script[:1])[0]


def evaluate_rule(active_entries: Sequence[EntryRow], mode: Mode, target_names: Sequence[str], *,
                  max_streak: int | None = None, script: Sequence[str] = (),
                  recent_winners: Sequence[str] = ()) -> RuleStatus:
    """The rule's state for the next spin. `script` is the queue of upcoming winners (its first
    step decides the next spin if that name is on the wheel); `recent_winners` are the names of
    the newest finished spins, newest first (for the streak breaker)."""
    targets = _target_matches(active_entries, target_names)
    matched_target, matched_ids = _resolve_target(targets)
    step = _script_step(active_entries, script)
    streak = _streak(matched_target, recent_winners) if mode == "always" else 0
    if mode == "fair":
        state: RuleState = "fair_mode"
    elif matched_target is None:
        state = "no_match"
    elif mode == "never" and len(matched_ids) == len(active_entries):
        state = "all_excluded"
    elif mode == "always" and max_streak is not None and streak >= max_streak:
        state = "streak_paused"
    else:
        state = "active"
    if state == "no_match":
        matched_target, matched_ids = None, []
    decider: Decider = "script" if step and step[1] else "rule" if state == "active" else "fair"
    return RuleStatus(state, matched_target, matched_ids, targets, step, streak, decider)


def pick_winner(active_entries: Sequence[EntryRow], mode: Mode, target_names: Sequence[str],
                rng: random.Random, *, chance: int | None = None, max_streak: int | None = None,
                script: Sequence[str] = (), recent_winners: Sequence[str] = ()) -> PickResult:
    """The script's first step wins if that name is on the wheel. Otherwise the rule: "always"
    X wins `chance`% of spins (None: every spin) and someone else wins the rest; "never" X
    never wins."""
    if not active_entries:
        raise ValueError("pick_winner requires at least one active entry")
    status = evaluate_rule(active_entries, mode, target_names, max_streak=max_streak, script=script,
                           recent_winners=recent_winners)
    if status.decider == "script":
        assert status.script_step is not None
        ids = set(status.script_step[1])
        return PickResult(rng.choice([e for e in active_entries if e.id in ids]), True, True)
    if status.decider == "fair":
        return PickResult(rng.choice(list(active_entries)), False)
    x_ids = set(status.matched_entry_ids)
    x = [e for e in active_entries if e.id in x_ids]
    others = [e for e in active_entries if e.id not in x_ids]
    if mode == "always":
        x_wins = chance is None or not others or rng.random() * 100 < chance
        return PickResult(rng.choice(x if x_wins else others), True)
    return PickResult(rng.choice(others), True)  # never
