"""Spin lifecycle (§9.4): pick outcome on the server, broadcast, finish after the animation."""
from __future__ import annotations

import asyncio
import logging

from app.analytics import counters
from app.context import AppContext
from app.db import repository as repo
from app.engine.rigging import pick_winner
from app.engine.spin_params import generate_spin_params
from app.errors import game_not_found, not_enough_entries, spin_in_progress
from app.models import SpinStarted
from app.services import serializers as ser
from app.services import views

log = logging.getLogger(__name__)

FINISH_GRACE_MS = 300


async def start_spin(ctx: AppContext, game_id: str) -> SpinStarted:
    game = await repo.get_game(game_id)
    if game is None:
        raise game_not_found()
    async with ctx.runtime.locked(game_id) as rt:
        if rt.current_spin is not None:
            raise spin_in_progress()
        game = await repo.get_game(game_id)  # re-read: rules are taken at the moment the spin starts
        if game is None:
            raise game_not_found()
        entries = await repo.list_entries(game_id)
        active = [e for e in entries if e.is_active]  # list_entries is ordered by position
        if len(active) < 2:
            raise not_enough_entries()

        pick = pick_winner(active, game.mode, game.target_names, ctx.rng)
        params = generate_spin_params(
            ctx.rng, ctx.settings.spin_duration_ms_min, ctx.settings.spin_duration_ms_max
        )
        row = await repo.record_spin(
            game_id,
            winner_entry_id=pick.winner.id,
            winner_name=pick.winner.name,
            mode=game.mode,
            rule_applied=pick.rule_applied,
        )
        spin = ser.spin_started(
            row,
            [e.id for e in active],
            landing_offset=params.landing_offset,
            extra_rotations=params.extra_rotations,
            duration_ms=params.duration_ms,
        )
        rt.current_spin = spin
        rt.current_rule_applied = pick.rule_applied
        await repo.touch_game(game_id)

        # Player version has no rule information; admin version carries rule_applied.
        await ctx.manager.send_players(game_id, ser.player_spin_started_event(spin))
        if game.origin == "admin_link":
            await ctx.manager.send_admins(
                game_id, ser.admin_spin_started_event(spin, pick.rule_applied)
            )
            await views.notify_admins(ctx, game)
        ctx.manager.request_dashboard()

        delay_s = (spin.duration_ms + FINISH_GRACE_MS) / 1000
        rt.spin_task = asyncio.get_running_loop().create_task(
            _finish_after(ctx, game_id, spin.spin_id, delay_s), name=f"spin-{game_id}-{spin.spin_id}"
        )
    return spin


async def _finish_after(ctx: AppContext, game_id: str, spin_id: int, delay_s: float) -> None:
    try:
        await asyncio.sleep(delay_s)
        await finish_spin(ctx, game_id, spin_id)
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001
        log.exception("finishing spin %s of game %s failed", spin_id, game_id)
        rt = ctx.runtime.peek(game_id)
        if rt is not None and rt.current_spin is not None and rt.current_spin.spin_id == spin_id:
            rt.current_spin = None


async def finish_spin(ctx: AppContext, game_id: str, spin_id: int) -> None:
    finished = await _finish_locked(ctx, game_id, spin_id)
    if finished is not None:
        # After the broadcasts and outside the lock, so counting never delays what players see.
        await counters.bump_spin(*finished)


async def _finish_locked(ctx: AppContext, game_id: str, spin_id: int) -> tuple[str, bool] | None:
    """Finish the spin; returns (origin, rule_applied) if it finished, for the daily totals."""
    async with ctx.runtime.locked(game_id) as rt:
        if rt.current_spin is None or rt.current_spin.spin_id != spin_id:
            return None
        spin = rt.current_spin
        row = await repo.finish_spin(spin_id)
        game = await repo.get_game(game_id)
        if game is None:  # deleted mid-spin
            rt.current_spin = None
            return None
        if game.remove_winner:
            await repo.update_entry(game_id, spin.winner_entry_id, is_active=False)
        result = ser.last_result_from_spin(row)
        rt.current_spin = None
        rt.current_rule_applied = False
        rt.last_result = result
        rt.spin_task = None
        await repo.touch_game(game_id)

        if result is not None:
            event = ser.spin_finished_event(result)
            await ctx.manager.send_players(game_id, event)
            if game.origin == "admin_link":
                await ctx.manager.send_admins(game_id, event)
        await views.notify_public_change(ctx, game_id)
    return game.origin, row.rule_applied
