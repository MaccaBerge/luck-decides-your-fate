"""Right now: live presence, from the socket registry (nothing is stored)."""
from app.analytics.registry import MetricContext, Section, metric

SECTION = Section("now", "Right now")


@metric(
    id="live_games",
    title="Games live now",
    description="Wheels and links with at least one person on the page.",
    section=SECTION,
    kind="number",
)
async def live_games(ctx: MetricContext) -> dict:
    return {"value": ctx.app.manager.live_games()}


@metric(
    id="players_now",
    title="Players connected now",
    description="Open wheel pages across all wheels and links. Your admin pages don't count.",
    section=SECTION,
    kind="number",
)
async def players_now(ctx: MetricContext) -> dict:
    return {"value": ctx.app.manager.player_total()}
