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
from app.models import AdminGameState, Dashboard, LastResult, LinkSummary, PublicGameState, WheelLists, WheelSummary
from app.services import control
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
        await repo.list_players(game.id) if game.kind == "multiplayer" else [],
        ctx.manager.players_here(game.id),
        await repo.open_requests(game.id) if game.kind == "multiplayer" else [],
        await repo.list_removed(game.id) if game.kind == "multiplayer" else [],
    )


def link_summary(ctx: AppContext, game: GameRow, entries: list[EntryRow], rule=None) -> LinkSummary:
    return ser.link_summary(
        game,
        player_count=ctx.manager.player_count(game.id),
        entry_count=sum(1 for e in entries if e.is_active),
        rule=rule,
    )


async def admin_state(ctx: AppContext, game: GameRow) -> AdminGameState:
    entries = await repo.list_entries(game.id)
    active = [e for e in entries if e.is_active]
    public = await public_state(ctx, game, entries)
    spins = await repo.list_spins(game.id, SPIN_HISTORY_LIMIT)
    eff = await control.effective_rule(game, active)
    r = eff.settings
    rule = evaluate_rule(
        active, r.mode, r.target_names, max_streak=r.max_streak, script=eff.script,
        recent_winners=[s.winner_name for s in spins if s.finished_at is not None],
    )
    return ser.admin_game_state(
        public, link_summary(ctx, game, entries, r), ser.control_out(eff), rule, spins
    )


async def wheel_lists(ctx: AppContext) -> WheelLists:
    """Every ordinary solo wheel, friends' wheels first (most recently used first in each)."""
    friends = await control.get_friends()
    standing = await control.get_standing()
    matched, others = [], []
    for game in await repo.list_solo_wheels():
        active = [e for e in await repo.list_entries(game.id) if e.is_active]
        eff = control.resolve(game, active, friends, standing)
        summary = WheelSummary(
            id=game.id,
            path=f"/g/{game.id}",
            names=[e.name for e in active],
            entry_count=len(active),
            open_now=ctx.manager.player_count(game.id) > 0,
            created_at=game.created_at,
            last_activity_at=game.last_activity_at,
            control=ser.control_out(eff),
            mode=eff.settings.mode,
            chance=eff.settings.chance,
            script=eff.script,
        )
        (matched if eff.matched else others).append(summary)
    return WheelLists(matched=matched, others=others)


async def dashboard(ctx: AppContext) -> Dashboard:
    links = []
    for game in await repo.list_admin_links():
        entries = await repo.list_entries(game.id)
        links.append(link_summary(ctx, game, entries))
    return ser.dashboard(ctx.manager.live_games(), links, await wheel_lists(ctx), ctx.backup_status)


async def dashboard_payload(ctx: AppContext) -> dict:
    return ser.dashboard_event(await dashboard(ctx))


# ---------------------------------------------------------------- broadcasts
async def notify_admins(ctx: AppContext, game: GameRow) -> None:
    if ctx.manager.has_admin_watchers(game.id):
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
