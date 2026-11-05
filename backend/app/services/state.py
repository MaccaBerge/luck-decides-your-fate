"""In-memory per-game live state (single process, --workers 1).

Holds the per-game mutation lock, the running spin and the cached last result. Nothing here is
persisted; spin history lives in SQLite.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import AsyncIterator

from app.errors import spin_in_progress
from app.models import LastResult, SpinStarted


@dataclass
class GameRuntime:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    current_spin: SpinStarted | None = None
    current_rule_applied: bool = False
    spin_task: asyncio.Task[None] | None = None
    last_result: LastResult | None = None


class RuntimeRegistry:
    def __init__(self) -> None:
        self._games: dict[str, GameRuntime] = {}

    def get(self, game_id: str) -> GameRuntime:
        rt = self._games.get(game_id)
        if rt is None:
            rt = GameRuntime()
            self._games[game_id] = rt
        return rt

    def peek(self, game_id: str) -> GameRuntime | None:
        return self._games.get(game_id)

    def current_spin(self, game_id: str) -> SpinStarted | None:
        rt = self._games.get(game_id)
        return rt.current_spin if rt else None

    @asynccontextmanager
    async def locked(self, game_id: str) -> AsyncIterator[GameRuntime]:
        rt = self.get(game_id)
        async with rt.lock:
            yield rt

    @asynccontextmanager
    async def mutation(self, game_id: str) -> AsyncIterator[GameRuntime]:
        """Lock the game for a friend-side mutation; 409 spin_in_progress while a spin runs."""
        async with self.locked(game_id) as rt:
            if rt.current_spin is not None:
                raise spin_in_progress()
            yield rt

    def forget(self, game_id: str) -> None:
        rt = self._games.pop(game_id, None)
        if rt and rt.spin_task and not rt.spin_task.done():
            if rt.spin_task is not asyncio.current_task():
                rt.spin_task.cancel()

    async def shutdown(self) -> None:
        tasks = [rt.spin_task for rt in self._games.values() if rt.spin_task and not rt.spin_task.done()]
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._games.clear()
