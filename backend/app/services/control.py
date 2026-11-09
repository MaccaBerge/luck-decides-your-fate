"""Which rule decides a game's spins, and the controller's friends list and standing rule.

- A controller link follows its own rule (as always).
- An ordinary solo wheel follows its own rule once the admin set one (`own_rule`). Otherwise, if
  at least two different friends are on it (app.engine.friends), it follows the standing rule;
  if not, it's fair.
- A game's script (next winners) is always its own, and comes first whatever the rule.

Admin only: nothing here is ever visible to players, and changing any of it sends them nothing.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.db import repository as repo
from app.db.rows import EntryRow, GameRow, Mode
from app.engine.friends import matched_friends, MATCH_THRESHOLD

FRIENDS_KEY = "friends"
STANDING_KEY = "standing_rule"

# link: a controller link's own rule; own: an ordinary wheel the admin set itself; standing: the
# standing rule (friends on it); none: an ordinary wheel without friends on it (fair).
RuleSource = Literal["link", "own", "standing", "none"]


@dataclass(frozen=True)
class RuleSettings:
    mode: Mode = "fair"
    target_names: list[str] = field(default_factory=list)
    chance: int | None = None
    max_streak: int | None = None


@dataclass(frozen=True)
class EffectiveRule:
    settings: RuleSettings
    script: list[str]
    source: RuleSource
    friends: list[str]          # the friends on the wheel (display names); [] for links

    @property
    def matched(self) -> bool:
        return len(self.friends) >= MATCH_THRESHOLD


def own_settings(game: GameRow) -> RuleSettings:
    return RuleSettings(game.mode, list(game.target_names), game.chance, game.max_streak)


async def get_friends() -> list[list[str]]:
    return list(await repo.get_setting(FRIENDS_KEY) or [])


async def set_friends(friends: list[list[str]]) -> None:
    await repo.set_setting(FRIENDS_KEY, friends)


async def get_standing() -> RuleSettings:
    raw = await repo.get_setting(STANDING_KEY) or {}
    return RuleSettings(
        mode=raw.get("mode", "fair"),
        target_names=list(raw.get("target_names", [])),
        chance=raw.get("chance"),
        max_streak=raw.get("max_streak"),
    )


async def set_standing(rule: RuleSettings) -> None:
    await repo.set_setting(
        STANDING_KEY,
        {"mode": rule.mode, "target_names": rule.target_names, "chance": rule.chance, "max_streak": rule.max_streak},
    )


def resolve(game: GameRow, active: list[EntryRow], friends: list[list[str]], standing: RuleSettings) -> EffectiveRule:
    """The rule for the game's next spin (pure, given the friends list and standing rule)."""
    if game.origin == "admin_link":
        return EffectiveRule(own_settings(game), list(game.script), "link", [])
    on_wheel = matched_friends(friends, [e.name for e in active])
    if game.own_rule:
        return EffectiveRule(own_settings(game), list(game.script), "own", on_wheel)
    if len(on_wheel) >= MATCH_THRESHOLD:
        return EffectiveRule(standing, list(game.script), "standing", on_wheel)
    return EffectiveRule(RuleSettings(), list(game.script), "none", on_wheel)


async def effective_rule(game: GameRow, active: list[EntryRow]) -> EffectiveRule:
    if game.origin == "admin_link":  # no settings to read
        return resolve(game, active, [], RuleSettings())
    return resolve(game, active, await get_friends(), await get_standing())
