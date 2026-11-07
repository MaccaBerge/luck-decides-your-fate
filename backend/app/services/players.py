"""Multiplayer players: identity, permissions, presence and the host role.

Everything here depends only on a game's public `kind`, never on its `origin`: a game the
controller made and a game a player hosted behave exactly the same (secrecy invariant).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from app.context import AppContext
from app.db import repository as repo
from app.db.rows import GameRow, PlayerRow
from app.errors import not_a_player, not_host, validation_error
from app.services import serializers as ser
from app.services import views
from app.timeutil import utc_iso

log = logging.getLogger(__name__)

# Keys stored per player; the frontend maps each to its emoji (frontend/src/lib/avatars.ts).
AVATARS = (
    "fox", "cat", "frog", "panda", "owl", "octopus", "penguin", "tiger", "unicorn", "bear",
    "wizard", "ninja", "hero", "cowboy", "alien", "robot",
)

GONE_AFTER = timedelta(minutes=10)   # away this long (no socket) -> removed from the game
SWEEP_INTERVAL_S = 60


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def check_avatar(avatar: str) -> str:
    if avatar not in AVATARS:
        raise validation_error("avatar: Pick one of the avatars")
    return avatar


async def player_for_token(game_id: str, token: str | None) -> PlayerRow | None:
    if not token:
        return None
    return await repo.player_by_token_hash(game_id, hash_token(token))


async def require_player(game: GameRow, token: str | None) -> PlayerRow:
    player = await player_for_token(game.id, token)
    if player is None:
        raise not_a_player()
    return player


async def require_control(game: GameRow, token: str | None) -> None:
    """Solo wheels stay open to anyone with the URL; in a multiplayer game only the host may
    spin, edit names or change settings."""
    if game.kind != "multiplayer":
        return
    player = await player_for_token(game.id, token)
    if player is None or not player.is_host:
        raise not_host()


# ---------------------------------------------------------------- leaving and the host role
async def ensure_host(ctx: AppContext, game_id: str) -> None:
    """Keep exactly one host while anyone is in the game: the earliest-joined player who is here,
    else the earliest-joined player."""
    players = await repo.list_players(game_id)
    if not players or any(p.is_host for p in players):
        return
    here = ctx.manager.players_here(game_id)
    nxt = next((p for p in players if p.id in here), players[0])
    await repo.set_host(game_id, nxt.id)


async def remove(ctx: AppContext, game_id: str, player_id: str) -> bool:
    """Remove a player and their name from the wheel. Call with the game's lock held and no spin
    running. The caller broadcasts the change."""
    if not await repo.remove_player(game_id, player_id):
        return False
    await ensure_host(ctx, game_id)
    return True


async def end_game(ctx: AppContext, game: GameRow) -> None:
    """The last player left: end the game. Call with the game's lock held.

    The owner's decision (November 2026): an ordinary wheel is deleted at once; a controller link
    is only closed (back to a solo wheel, no code), so a friend can never delete the controller's
    link. This is the one place here that looks at `origin`; the leave response is identical
    either way, and only revisiting the old URL shows the difference.
    """
    if game.origin == "public":
        await repo.delete_game(game.id)
        ctx.runtime.forget(game.id)
        await ctx.manager.send_players(game.id, ser.GAME_DELETED_EVENT)
        await ctx.manager.close_game(game.id, code=1000)
        ctx.manager.request_dashboard()
    else:
        await repo.close_multiplayer(game.id)
        await repo.touch_game(game.id)
        await views.notify_public_change(ctx, game.id)


async def sweep_once(ctx: AppContext, now: datetime | None = None) -> list[str]:
    """Remove players who have had no open socket for GONE_AFTER. Games mid-spin are skipped and
    retried on the next sweep. Returns the removed player IDs."""
    cutoff = utc_iso((now or datetime.now(timezone.utc)) - GONE_AFTER)
    removed: list[str] = []
    changed: set[str] = set()
    for p in await repo.players_last_seen_before(cutoff):
        if p.id in ctx.manager.players_here(p.game_id):
            continue  # connected the whole time: last_seen_at only moves on connect/disconnect
        async with ctx.runtime.locked(p.game_id) as rt:
            if rt.current_spin is not None:
                continue
            fresh = await repo.get_player(p.game_id, p.id)
            if fresh is None or fresh.last_seen_at >= cutoff or p.id in ctx.manager.players_here(p.game_id):
                continue
            if await remove(ctx, p.game_id, p.id):
                removed.append(p.id)
                changed.add(p.game_id)
    for game_id in changed:
        await views.notify_public_change(ctx, game_id)
    if removed:
        log.info("players: removed %d player(s) away for over %s", len(removed), GONE_AFTER)
    return removed


async def sweep_loop(ctx: AppContext, interval_s: float = SWEEP_INTERVAL_S) -> None:
    while True:
        await asyncio.sleep(interval_s)
        try:
            await sweep_once(ctx)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("player sweep failed")
