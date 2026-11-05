"""Connection registry and low-level broadcast helpers.

Three kinds of sockets:
- player sockets   (/ws/games/{id})        -> counted as players
- admin game sockets (/ws/admin/games/{id}) -> never counted
- dashboard sockets (/ws/admin)             -> never counted

This module only knows about sockets and JSON payloads. Building the payloads (and keeping rig
information away from player sockets) is done by the callers in app.services.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any, Awaitable, Callable

from fastapi import WebSocket

log = logging.getLogger(__name__)

# Close code on shutdown. Clients treat it as non-fatal and reconnect.
SERVICE_RESTART = 1012

SEND_TIMEOUT_S = 5.0
DASHBOARD_MIN_INTERVAL_S = 0.25  # at most 4 dashboard pushes per second (coalesced)


class ConnectionManager:
    def __init__(self) -> None:
        self._players: dict[str, set[WebSocket]] = defaultdict(set)
        self._admins: dict[str, set[WebSocket]] = defaultdict(set)
        self._dashboards: set[WebSocket] = set()
        self._dash_builder: Callable[[], Awaitable[dict[str, Any]]] | None = None
        self._dash_task: asyncio.Task[None] | None = None
        self._dash_dirty = False
        self._background: set[asyncio.Task[Any]] = set()

    # ---------- registry ----------
    def add_player(self, game_id: str, ws: WebSocket) -> None:
        self._players[game_id].add(ws)

    def remove_player(self, game_id: str, ws: WebSocket) -> bool:
        sockets = self._players.get(game_id)
        if not sockets or ws not in sockets:
            return False
        sockets.discard(ws)
        if not sockets:
            self._players.pop(game_id, None)
        return True

    def add_admin(self, game_id: str, ws: WebSocket) -> None:
        self._admins[game_id].add(ws)

    def remove_admin(self, game_id: str, ws: WebSocket) -> None:
        sockets = self._admins.get(game_id)
        if sockets is not None:
            sockets.discard(ws)
            if not sockets:
                self._admins.pop(game_id, None)

    def add_dashboard(self, ws: WebSocket) -> None:
        self._dashboards.add(ws)

    def remove_dashboard(self, ws: WebSocket) -> None:
        self._dashboards.discard(ws)

    # ---------- presence ----------
    def player_count(self, game_id: str) -> int:
        return len(self._players.get(game_id, ()))

    def live_games(self) -> int:
        return sum(1 for sockets in self._players.values() if sockets)

    def has_admin_watchers(self, game_id: str) -> bool:
        return bool(self._admins.get(game_id))

    def has_dashboards(self) -> bool:
        return bool(self._dashboards)

    # ---------- sending ----------
    async def _send(self, ws: WebSocket, payload: dict[str, Any] | str) -> bool:
        text = payload if isinstance(payload, str) else json.dumps(payload, separators=(",", ":"))
        try:
            await asyncio.wait_for(ws.send_text(text), SEND_TIMEOUT_S)
            return True
        except Exception:  # noqa: BLE001 - a dead socket must never break a broadcast
            return False

    async def send(self, ws: WebSocket, payload: dict[str, Any]) -> bool:
        return await self._send(ws, payload)

    async def _send_many(self, sockets: list[WebSocket], payload: dict[str, Any]) -> list[WebSocket]:
        if not sockets:
            return []
        text = json.dumps(payload, separators=(",", ":"))
        results = await asyncio.gather(*(self._send(ws, text) for ws in sockets))
        return [ws for ws, ok in zip(sockets, results) if not ok]

    async def send_players(self, game_id: str, payload: dict[str, Any]) -> None:
        await self._send_many(list(self._players.get(game_id, ())), payload)

    async def send_admins(self, game_id: str, payload: dict[str, Any]) -> None:
        await self._send_many(list(self._admins.get(game_id, ())), payload)

    async def close_game(self, game_id: str, code: int = 1000) -> None:
        """Close and forget every socket (player + admin) of a game."""
        sockets = list(self._players.pop(game_id, ())) + list(self._admins.pop(game_id, ()))
        for ws in sockets:
            try:
                await ws.close(code=code)
            except Exception:  # noqa: BLE001
                pass

    async def close_all(self) -> None:
        sockets = [ws for s in self._players.values() for ws in s]
        sockets += [ws for s in self._admins.values() for ws in s]
        sockets += list(self._dashboards)
        self._players.clear()
        self._admins.clear()
        self._dashboards.clear()
        for ws in sockets:
            try:
                await ws.close(code=SERVICE_RESTART)
            except Exception:  # noqa: BLE001
                pass

    # ---------- background work ----------
    def spawn(self, coro: Awaitable[Any]) -> None:
        """Run a broadcast detached from the caller (e.g. from a socket handler being torn down)."""

        async def runner() -> None:
            try:
                await coro
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                log.exception("background broadcast failed")

        task = asyncio.get_running_loop().create_task(runner())
        self._background.add(task)
        task.add_done_callback(self._background.discard)

    # ---------- dashboard (coalesced) ----------
    def set_dashboard_builder(self, builder: Callable[[], Awaitable[dict[str, Any]]]) -> None:
        self._dash_builder = builder

    def request_dashboard(self) -> None:
        """Schedule a dashboard push to every dashboard socket (coalesced, <= 4/s)."""
        if not self._dashboards or self._dash_builder is None:
            return
        if self._dash_task is not None and not self._dash_task.done():
            self._dash_dirty = True
            return
        self._dash_task = asyncio.get_running_loop().create_task(self._dashboard_loop())

    async def _dashboard_loop(self) -> None:
        assert self._dash_builder is not None
        while True:
            self._dash_dirty = False
            sockets = list(self._dashboards)
            if sockets:
                try:
                    payload = await self._dash_builder()
                    dead = await self._send_many(sockets, payload)
                    for ws in dead:
                        self._dashboards.discard(ws)
                except Exception:  # noqa: BLE001
                    log.exception("dashboard broadcast failed")
            await asyncio.sleep(DASHBOARD_MIN_INTERVAL_S)
            if not self._dash_dirty:
                return

    async def shutdown(self) -> None:
        for task in list(self._background):
            task.cancel()
        if self._dash_task is not None and not self._dash_task.done():
            self._dash_task.cancel()
            try:
                await self._dash_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        await self.close_all()
