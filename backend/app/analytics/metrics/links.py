"""Your links: admin links are never deleted automatically, so their history is complete."""
from app.analytics.query import rows, scalar
from app.analytics.registry import MetricContext, Section, metric

SECTION = Section("links", "Your links")


@metric(
    id="links_created",
    title="Links created",
    description="All your links. Links you deleted aren't counted.",
    section=SECTION,
    kind="number",
)
async def links_created(ctx: MetricContext) -> dict:
    total = await scalar("SELECT COUNT(*) FROM games WHERE origin = 'admin_link'")
    recent = await scalar(
        "SELECT COUNT(*) FROM games WHERE origin = 'admin_link' AND created_at >= ?", ctx.since
    )
    return {"value": total, "hint": f"{recent} in range"}


@metric(
    id="links_opened",
    title="Links opened",
    description="Links someone has opened at least once.",
    section=SECTION,
    kind="number",
)
async def links_opened(ctx: MetricContext) -> dict:
    total = await scalar("SELECT COUNT(*) FROM games WHERE origin = 'admin_link'")
    opened = await scalar(
        "SELECT COUNT(*) FROM games WHERE origin = 'admin_link' AND first_opened_at IS NOT NULL"
    )
    return {"value": opened, "hint": f"Of {total}"}


@metric(
    id="link_spins",
    title="Spins on links",
    description="Finished spins on your links in the range.",
    section=SECTION,
    kind="number",
)
async def link_spins(ctx: MetricContext) -> dict:
    value = await scalar(
        "SELECT COUNT(*) FROM spins JOIN games ON games.id = spins.game_id"
        " WHERE games.origin = 'admin_link' AND spins.finished_at IS NOT NULL"
        " AND spins.started_at >= ?",
        ctx.since,
    )
    return {"value": value}


@metric(
    id="rule_decided",
    title="Decided by the rule",
    description="Finished spins on your links in the range where the rule picked the result.",
    section=SECTION,
    kind="number",
)
async def rule_decided(ctx: MetricContext) -> dict:
    [(total, decided)] = await rows(
        "SELECT COUNT(*), COALESCE(SUM(spins.rule_applied), 0) FROM spins"
        " JOIN games ON games.id = spins.game_id"
        " WHERE games.origin = 'admin_link' AND spins.finished_at IS NOT NULL"
        " AND spins.started_at >= ?",
        ctx.since,
    )
    hint = f"{round(100 * decided / total)}% of link spins" if total else None
    return {"value": decided, "hint": hint}
