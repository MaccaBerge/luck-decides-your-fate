"""Stored wheels: ordinary (public) wheels still in the database.

Idle wheels are deleted automatically, together with their names and spins, so these only
describe wheels that are still stored.
"""
from app.analytics.query import scalar
from app.analytics.registry import MetricContext, Section, metric

SECTION = Section("wheels", "Stored wheels")


@metric(
    id="wheels_stored",
    title="Wheels stored",
    description="Ordinary wheels in the database now. Idle wheels are deleted automatically.",
    section=SECTION,
    kind="number",
)
async def wheels_stored(ctx: MetricContext) -> dict:
    return {"value": await scalar("SELECT COUNT(*) FROM games WHERE origin = 'public'")}


@metric(
    id="wheels_used",
    title="Wheels used in range",
    description="Ordinary wheels last used in the range. Only counts wheels that haven't been deleted.",
    section=SECTION,
    kind="number",
)
async def wheels_used(ctx: MetricContext) -> dict:
    value = await scalar(
        "SELECT COUNT(*) FROM games WHERE origin = 'public' AND last_activity_at >= ?", ctx.since
    )
    return {"value": value}


@metric(
    id="avg_names",
    title="Names per wheel",
    description="Average names on a stored ordinary wheel, hidden names included.",
    section=SECTION,
    kind="number",
)
async def avg_names(ctx: MetricContext) -> dict:
    wheels = await scalar("SELECT COUNT(*) FROM games WHERE origin = 'public'")
    if not wheels:
        return {"value": 0, "hint": "No wheels stored"}
    names = await scalar(
        "SELECT COUNT(*) FROM entries JOIN games ON games.id = entries.game_id"
        " WHERE games.origin = 'public'"
    )
    return {"value": round(names / wheels, 1), "hint": f"Across {wheels} wheel{'s' if wheels != 1 else ''}"}
