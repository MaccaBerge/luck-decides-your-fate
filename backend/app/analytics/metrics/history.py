"""Daily totals: read from `daily_counters`, so wheels deleted by the cleanup still count."""
from datetime import date

from app.analytics import counters
from app.analytics.query import rows, scalar
from app.analytics.registry import MetricContext, Section, metric

SECTION = Section("history", "Daily totals")


async def since_hint(*names: str) -> str:
    """"Since <first day with data>" for the named counters, or "No data yet"."""
    marks = ", ".join("?" for _ in names)
    first = await scalar(f"SELECT MIN(day) FROM daily_counters WHERE name IN ({marks})", *names)
    if not first:
        return "No data yet"
    d = date.fromisoformat(first)
    return f"Since {d:%b} {d.day}, {d.year}"


async def counter_total(ctx: MetricContext, *names: str) -> int:
    """The summed totals for `names` over the selected range."""
    marks = ", ".join("?" for _ in names)
    total = await scalar(
        f"SELECT SUM(value) FROM daily_counters WHERE name IN ({marks}) AND day >= ?",
        *names, ctx.first_day.isoformat(),
    )
    return int(total or 0)


async def counter_series(ctx: MetricContext, *names: str, divide_by: int = 1) -> dict:
    """A `series` of the summed daily totals for `names` (each day rounded after `divide_by`),
    with a "since" hint."""
    marks = ", ".join("?" for _ in names)
    counts = await rows(
        f"SELECT day, SUM(value) FROM daily_counters WHERE name IN ({marks}) AND day >= ?"
        " GROUP BY day",
        *names, ctx.first_day.isoformat(),
    )
    days = {day: round(value / divide_by) for day, value in counts}
    return {**ctx.fill_days(days), "hint": await since_hint(*names)}


@metric(
    id="wheels_created_per_day",
    title="Wheels created per day",
    description="New ordinary wheels each day, including ones deleted since.",
    section=SECTION,
    kind="series",
)
async def wheels_created_per_day(ctx: MetricContext) -> dict:
    return await counter_series(ctx, counters.WHEELS_CREATED)


@metric(
    id="spins_per_day",
    title="Spins per day",
    description="Finished spins each day on wheels and links together, including deleted wheels.",
    section=SECTION,
    kind="series",
)
async def spins_per_day(ctx: MetricContext) -> dict:
    return await counter_series(ctx, counters.SPINS_WHEELS, counters.SPINS_LINKS)


@metric(
    id="names_added_per_day",
    title="Names added per day",
    description="Names added to wheels and links each day, including deleted wheels.",
    section=SECTION,
    kind="series",
)
async def names_added_per_day(ctx: MetricContext) -> dict:
    return await counter_series(ctx, counters.NAMES_ADDED)
