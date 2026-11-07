"""Daily totals: read from `daily_counters`, so wheels deleted by the cleanup still count."""
from datetime import date

from app.analytics import counters
from app.analytics.query import rows, scalar
from app.analytics.registry import MetricContext, Section, metric

SECTION = Section("history", "Daily totals")


async def counter_series(ctx: MetricContext, *names: str) -> dict:
    """A `series` of the summed daily totals for `names`, with a "since" hint."""
    marks = ", ".join("?" for _ in names)
    counts = dict(await rows(
        f"SELECT day, SUM(value) FROM daily_counters WHERE name IN ({marks}) AND day >= ?"
        " GROUP BY day",
        *names, ctx.first_day.isoformat(),
    ))
    first = await scalar(f"SELECT MIN(day) FROM daily_counters WHERE name IN ({marks})", *names)
    if first:
        d = date.fromisoformat(first)
        hint = f"Since {d:%b} {d.day}, {d.year}"
    else:
        hint = "No data yet"
    return {**ctx.fill_days(counts), "hint": hint}


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
