"""Hourly expiry of idle public games. Admin links are never deleted automatically."""
from __future__ import annotations

import asyncio
import logging

from app.context import AppContext
from app.db import repository as repo
from app.services import serializers as ser

log = logging.getLogger(__name__)

CLEANUP_INTERVAL_S = 60 * 60


async def run_cleanup_once(ctx: AppContext) -> list[str]:
    deleted = await repo.delete_inactive_public_games(ctx.settings.game_ttl_days)
    for game_id in deleted:
        ctx.runtime.forget(game_id)
        await ctx.manager.send_players(game_id, ser.GAME_DELETED_EVENT)
        await ctx.manager.close_game(game_id, code=1000)
    if deleted:
        log.info("cleanup: deleted %d idle public game(s)", len(deleted))
        ctx.manager.request_dashboard()
    return deleted


async def cleanup_loop(ctx: AppContext, interval_s: float = CLEANUP_INTERVAL_S) -> None:
    while True:
        try:
            await run_cleanup_once(ctx)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("cleanup run failed")
        await asyncio.sleep(interval_s)
