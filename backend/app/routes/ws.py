"""WebSocket endpoints (§9). Server -> client only; anything received is ignored.

Rejected connections are accepted and then immediately closed with 4401 / 4404 so that browsers
and test clients observe a clean close code.
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import is_admin
from app.context import AppContext, get_ctx
from app.db import repository as repo
from app.services import serializers as ser
from app.services import views

router = APIRouter()

CLOSE_UNAUTHORIZED = 4401
CLOSE_NOT_FOUND = 4404


async def _reject(ws: WebSocket, code: int) -> None:
    await ws.accept()
    await ws.close(code=code)


async def _drain(ws: WebSocket) -> None:
    """Keep the socket open until the client goes away, ignoring anything it sends."""
    try:
        while True:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                return
    except (WebSocketDisconnect, RuntimeError):
        return


@router.websocket("/ws/games/{game_id}")
async def player_socket(ws: WebSocket, game_id: str) -> None:
    ctx: AppContext = get_ctx(ws)
    game = await repo.get_game(game_id)
    if game is None:
        await _reject(ws, CLOSE_NOT_FOUND)
        return
    await ws.accept()
    registered = False
    try:
        async with ctx.runtime.locked(game_id):
            if await repo.get_game(game_id) is None:  # deleted while we waited
                await ws.close(code=CLOSE_NOT_FOUND)
                return
            ctx.manager.add_player(game_id, ws)
            registered = True
            await repo.mark_opened(game_id)
            game = await repo.get_game(game_id)
            assert game is not None
            await ctx.manager.send(ws, ser.player_state_event(await views.public_state(ctx, game)))
            await views.notify_admin_change(ctx, game_id)  # presence -> admins + dashboard only
        await _drain(ws)
    finally:
        if registered and ctx.manager.remove_player(game_id, ws):
            # Detached: the handler may be cancelled while tearing down.
            ctx.manager.spawn(views.notify_admin_change(ctx, game_id))


@router.websocket("/ws/admin")
async def dashboard_socket(ws: WebSocket) -> None:
    ctx: AppContext = get_ctx(ws)
    if not is_admin(ws):
        await _reject(ws, CLOSE_UNAUTHORIZED)
        return
    await ws.accept()
    ctx.manager.add_dashboard(ws)
    try:
        await ctx.manager.send(ws, await views.dashboard_payload(ctx))
        await _drain(ws)
    finally:
        ctx.manager.remove_dashboard(ws)


@router.websocket("/ws/admin/games/{game_id}")
async def admin_game_socket(ws: WebSocket, game_id: str) -> None:
    ctx: AppContext = get_ctx(ws)
    if not is_admin(ws):
        await _reject(ws, CLOSE_UNAUTHORIZED)
        return
    game = await repo.get_game(game_id)
    if game is None or game.origin != "admin_link":
        await _reject(ws, CLOSE_NOT_FOUND)
        return
    await ws.accept()
    try:
        async with ctx.runtime.locked(game_id):
            game = await repo.get_game(game_id)
            if game is None:
                await ws.close(code=CLOSE_NOT_FOUND)
                return
            ctx.manager.add_admin(game_id, ws)
            await ctx.manager.send(ws, ser.admin_state_event(await views.admin_state(ctx, game)))
        await _drain(ws)
    finally:
        ctx.manager.remove_admin(game_id, ws)
