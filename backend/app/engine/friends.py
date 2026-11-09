"""Friends: which of the admin's friends are on a wheel (pure logic).

A friend is a list of names they go by ("Jonas", "Jonny"), first one as their display name. A
wheel matches when at least MATCH_THRESHOLD *different* friends are on it, so one common name on
a stranger's wheel isn't enough, and "Jonas" + "Jonny" on one wheel counts once.
"""
from __future__ import annotations

from typing import Sequence

from app.engine.names import normalize_name

MATCH_THRESHOLD = 2
MAX_FRIENDS = 50
MAX_ALIASES = 5
MAX_NAME_LEN = 40


def parse_friends(text: str) -> list[list[str]]:
    """One friend per line, names they go by separated by commas. Blank names are dropped."""
    friends = []
    for line in text.splitlines():
        names = [n.strip() for n in line.split(",")]
        names = [n for n in names if n]
        if names:
            friends.append(names)
    return friends


def matched_friends(friends: Sequence[Sequence[str]], entry_names: Sequence[str]) -> list[str]:
    """The display names of the friends on the wheel (matched like rule targets), in list order."""
    on_wheel = {normalize_name(n) for n in entry_names} - {""}
    return [
        f[0]
        for f in friends
        if f and any(normalize_name(a) in on_wheel for a in f if normalize_name(a))
    ]


def is_match(friends: Sequence[Sequence[str]], entry_names: Sequence[str]) -> bool:
    return len(matched_friends(friends, entry_names)) >= MATCH_THRESHOLD
