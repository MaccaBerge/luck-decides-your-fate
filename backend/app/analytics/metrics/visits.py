"""Visits: how long wheel pages stay open while visible, from the `visits` and `active_seconds`
daily counters.

A visit is one load of a wheel page in one tab. The page closes its socket after 15 seconds hidden
and reconnects (with ?resume=1, which doesn't count a new visit) when it's visible again, so
socket time is close to visible time. Each connection adds at most 2 hours.
"""
from app.analytics import counters
from app.analytics.metrics.history import counter_series, counter_total, since_hint
from app.analytics.registry import MetricContext, Section, metric

SECTION = Section("visits", "Visits")

ABOUT = "A visit is one wheel tab while it's on screen, your own visits included."


def _plural(n: int, word: str) -> str:
    return f"{n:,} {word}{'' if n == 1 else 's'}"


@metric(
    id="active_time_per_visit",
    title="Active time per visit",
    description=f"Average time a wheel page was visible, in the range. {ABOUT}",
    section=SECTION,
    kind="number",
)
async def active_time_per_visit(ctx: MetricContext) -> dict:
    visits = await counter_total(ctx, counters.VISITS)
    seconds = await counter_total(ctx, counters.ACTIVE_SECONDS)
    hint = f"{_plural(visits, 'visit')} · {await since_hint(counters.VISITS)}"
    return {"value": round(seconds / visits) if visits else 0, "hint": hint, "format": "duration"}


@metric(
    id="spins_per_visit",
    title="Spins per visit",
    description=f"Finished spins on wheels and links, divided by visits, in the range. {ABOUT}",
    section=SECTION,
    kind="number",
)
async def spins_per_visit(ctx: MetricContext) -> dict:
    visits = await counter_total(ctx, counters.VISITS)
    spins = await counter_total(ctx, counters.SPINS_WHEELS, counters.SPINS_LINKS)
    hint = f"{_plural(spins, 'spin')} · {await since_hint(counters.VISITS)}"
    return {"value": round(spins / visits, 1) if visits else 0, "hint": hint}


@metric(
    id="visits_per_day",
    title="Visits per day",
    description=f"Wheel pages opened each day. {ABOUT}",
    section=SECTION,
    kind="series",
)
async def visits_per_day(ctx: MetricContext) -> dict:
    return await counter_series(ctx, counters.VISITS)


@metric(
    id="active_minutes_per_day",
    title="Active minutes per day",
    description=f"Minutes wheel pages were visible each day, at most 2 hours per connection. {ABOUT}",
    section=SECTION,
    kind="series",
)
async def active_minutes_per_day(ctx: MetricContext) -> dict:
    return await counter_series(ctx, counters.ACTIVE_SECONDS, divide_by=60)
