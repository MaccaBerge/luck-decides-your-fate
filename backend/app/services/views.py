"""Build full API views from the database + live state, and broadcast them.

Broadcast helpers:
- notify_public_change: a friend-visible change -> `state` to players, `admin_state` to admin
  sockets of that game, dashboard update.
- notify_admin_change: a rule/label/presence change -> `admin_state` + dashboard ONLY. Never
  touches player sockets (secrecy §10.3).
"""
from __future__ import annotations

from app.context import AppContext
from app.db import repository as repo
from app.db.rows import EntryRow, GameRow
from app.engine.rigging import evaluate_rule
from app.models import AdminGameState, Dashboard, LastResult, LinkSummary, PublicGameState
from app.services import serializers as ser

SPIN_HISTORY_LIMIT = 50
PUBLIC_HISTORY_LIMIT = 10


async def last_result(ctx: AppContext, game_id: str) -> LastResult | None:
    rt = ctx.runtime.peek(game_id)
    if rt is not None and rt.last_result is not None:
        return rt.last_result
    spin = await repo.get_last_finished_spin(game_id)
    return ser.last_result_from_spin(spin) if spin else None


async def public_state(
    ctx: AppContext, game: GameRow, entries: list[EntryRow] | None = None
) -> PublicGameState:
    if entries is None:
        entries = await repo.list_entries(game.id)
    return ser.public_game_state(
        game,
        entries,
        ctx.runtime.current_spin(game.id),
        await last_result(ctx, game.id),
        await repo.list_finished_spins(game.id, PUBLIC_HISTORY_LIMIT),
    )


def link_summary(ctx: AppContext, game: GameRow, entries: list[EntryRow]) -> LinkSummary:
    return ser.link_summary(
        game,
        player_count=ctx.manager.player_count(game.id),
        entry_count=sum(1 for e in entries if e.is_active),
    )


async def admin_state(ctx: AppContext, game: GameRow) -> AdminGameState:
    entries = await repo.list_entries(game.id)
    active = [e for e in entries if e.is_active]
    public = await public_state(ctx, game, entries)
    rule = evaluate_rule(active, game.mode, game.target_names)
    spins = await repo.list_spins(game.id, SPIN_HISTORY_LIMIT)
    return ser.admin_game_state(public, link_summary(ctx, game, entries), rule, spins)


async def dashboard(ctx: AppContext) -> Dashboard:
    links = []
    for game in await repo.list_admin_links():
        entries = await repo.list_entries(game.id)
        links.append(link_summary(ctx, game, entries))
    return ser.dashboard(ctx.manager.live_games(), links, ctx.backup_status)


async def dashboard_payload(ctx: AppContext) -> dict:
    return ser.dashboard_event(await dashboard(ctx))


# ---------------------------------------------------------------- broadcasts
async def notify_admins(ctx: AppContext, game: GameRow) -> None:
    if game.origin == "admin_link" and ctx.manager.has_admin_watchers(game.id):
        await ctx.manager.send_admins(game.id, ser.admin_state_event(await admin_state(ctx, game)))


async def notify_public_change(ctx: AppContext, game_id: str) -> None:
    game = await repo.get_game(game_id)
    if game is None:
        return
    state = await public_state(ctx, game)
    await ctx.manager.send_players(game_id, ser.player_state_event(state))
    await notify_admins(ctx, game)
    ctx.manager.request_dashboard()


async def notify_admin_change(ctx: AppContext, game_id: str) -> None:
    """Admin-only update (rules, label, presence). Sends NOTHING to player sockets."""
    game = await repo.get_game(game_id)
    if game is not None:
        await notify_admins(ctx, game)
    ctx.manager.request_dashboard()
