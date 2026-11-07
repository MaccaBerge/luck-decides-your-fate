"""Per link: one row per admin link, newest first, like the dashboard."""
from app.analytics.query import rows
from app.analytics.registry import MetricContext, Section, metric
from app.db import repository as repo
from app.services.serializers import link_status

SECTION = Section("per_link", "Per link")

STATUS_TEXT = {"created": "Created", "connected": "Connected", "disconnected": "Disconnected"}


@metric(
    id="per_link_spins",
    title="Spins per link",
    description="Finished spins on each link in the range, and how many the rule decided.",
    section=SECTION,
    kind="table",
)
async def per_link_spins(ctx: MetricContext) -> dict:
    counts = {
        game_id: (spins, decided)
        for game_id, spins, decided in await rows(
            "SELECT game_id, COUNT(*), SUM(rule_applied) FROM spins"
            " WHERE finished_at IS NOT NULL AND started_at >= ? GROUP BY game_id",
            ctx.since,
        )
    }
    table = []
    for game in await repo.list_admin_links():
        spins, decided = counts.get(game.id, (0, 0))
        status = link_status(game, ctx.app.manager.player_count(game.id))
        label = game.label if game.label and game.label.strip() else "Untitled"
        table.append([label, STATUS_TEXT[status], spins, decided or 0])
    return {"columns": ["Label", "Status", "Spins", "Rule decided"], "rows": table}
