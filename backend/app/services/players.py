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
from app.errors import (
    entries_limit,
    game_locked,
    not_a_player,
    not_host,
    removed,
    request_declined,
    request_not_found,
    validation_error,
)
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


MAX_ENTRIES = 100


async def remove(ctx: AppContext, game_id: str, player_id: str, reason: str | None = None) -> bool:
    """Remove a player and their name from the wheel. Call with the game's lock held and no spin
    running. The caller broadcasts the change. `reason` (kicked, banned, timed_out) is remembered
    so their page can say what happened; leaving on your own has none."""
    if not await repo.remove_player(game_id, player_id, reason):
        return False
    await ensure_host(ctx, game_id)
    return True


# ---------------------------------------------------------------- removed players
async def my_status(game: GameRow, token: str | None) -> tuple[str, str | None]:
    """(status, request) for this browser's key: player, kicked, banned, timed_out or none."""
    if not token:
        return "none", None
    h = hash_token(token)
    if await repo.player_by_token_hash(game.id, h) is not None:
        return "player", None
    r = await repo.removal_by_token_hash(game.id, h)
    return (r.reason, r.request) if r else ("none", None)


async def check_can_join(game: GameRow, token: str | None) -> None:
    """A banned browser can't join again; a kicked one must ask the host (POST .../rejoin)."""
    status, _ = await my_status(game, token)
    if status in ("kicked", "banned"):
        raise removed(status)
    # An empty locked game would be shut for ever: the next person in becomes host as usual.
    if game.locked and await repo.count_players(game.id) > 0:
        raise game_locked()


async def rejoin(ctx: AppContext, game: GameRow, token: str | None) -> bool:
    """Come back after being removed. Timed out: straight back in (unless locked). Kicked: asks the
    host. Banned: refused. Returns True if back in, False if the host has been asked. Call with the
    game's lock held and no spin running."""
    r = await repo.removal_by_token_hash(game.id, hash_token(token)) if token else None
    if r is None:
        raise not_a_player()
    if r.reason == "banned":
        raise removed("banned")
    if r.reason == "kicked":
        if r.request == "declined":
            raise request_declined()
        await repo.set_request(game.id, r.player_id, "pending")
        return False
    if game.locked:
        raise game_locked()
    await _readd(ctx, game.id, r.player_id)
    return True


async def answer_request(ctx: AppContext, game_id: str, player_id: str, accept: bool) -> None:
    """The host accepts (back in, even if locked) or declines a kicked player's request."""
    r = await repo.removal_by_player(game_id, player_id)
    if r is None or r.request != "pending":
        raise request_not_found()
    if accept:
        await _readd(ctx, game_id, player_id)
    else:
        await repo.set_request(game_id, player_id, "declined")


async def _readd(ctx: AppContext, game_id: str, player_id: str) -> None:
    if len(await repo.list_entries(game_id)) + 1 > MAX_ENTRIES:
        raise entries_limit()
    await repo.readd_player(game_id, player_id)
    await ensure_host(ctx, game_id)


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
            if await remove(ctx, p.game_id, p.id, "timed_out"):
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
