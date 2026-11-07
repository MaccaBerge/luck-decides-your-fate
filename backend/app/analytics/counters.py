"""Daily totals for analytics, kept in `daily_counters` so they survive the cleanup of idle wheels.

Call `bump(NAME)` only after the action it counts has succeeded. A failed bump is logged (class
name only) and never breaks that action. To add a counter, add a constant here and a `bump` call.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.db.connection import connect

log = logging.getLogger(__name__)

WHEELS_CREATED = "wheels_created"          # POST /api/games
LINKS_CREATED = "links_created"            # POST /api/admin/links
SPINS_WHEELS = "spins_wheels"              # a spin finished on an ordinary wheel
SPINS_LINKS = "spins_links"                # a spin finished on a link
SPINS_RULE_DECIDED = "spins_rule_decided"  # a finished spin where the rule picked the result
NAMES_ADDED = "names_added"                # names added through POST /api/games/{id}/entries

ALL = (WHEELS_CREATED, LINKS_CREATED, SPINS_WHEELS, SPINS_LINKS, SPINS_RULE_DECIDED, NAMES_ADDED)

_UPSERT = (
    "INSERT INTO daily_counters (day, name, value) VALUES (?, ?, ?)"
    " ON CONFLICT (day, name) DO UPDATE SET value = value + excluded.value"
)


def utc_day(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).astimezone(timezone.utc).date().isoformat()


async def bump(name: str, by: int = 1) -> None:
    """Add `by` to today's (UTC) total for `name`. Never raises."""
    try:
        if name not in ALL:
            raise ValueError("unknown counter")
        async with connect() as db:
            await db.execute(_UPSERT, (utc_day(), name, by))
    except Exception as exc:  # noqa: BLE001  counting must never break the action it counts
        log.warning("analytics counter %s failed: %s", name, type(exc).__name__)


async def bump_spin(origin: str, rule_applied: bool) -> None:
    """Count a finished spin. Every spin makes the same two writes, whether or not a rule decided it."""
    await bump(SPINS_LINKS if origin == "admin_link" else SPINS_WHEELS)
    await bump(SPINS_RULE_DECIDED, 1 if rule_applied else 0)
