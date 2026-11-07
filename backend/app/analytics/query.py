"""Small read-only query helpers for metric functions."""
from __future__ import annotations

from typing import Any

from app.db.connection import connect


async def scalar(sql: str, *params: Any) -> Any:
    """The first column of the first row, or None."""
    async with connect() as db:
        async with db.execute(sql, params) as cur:
            row = await cur.fetchone()
    return row[0] if row else None


async def rows(sql: str, *params: Any) -> list[tuple[Any, ...]]:
    async with connect() as db:
        async with db.execute(sql, params) as cur:
            return [tuple(r) for r in await cur.fetchall()]
