from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import aiosqlite

_SCHEMA_PATH = Path(__file__).with_name("schema.sql")
_db_path: str | None = None


def get_db_path() -> str:
    if _db_path is None:
        raise RuntimeError("Database not initialized; call init_db() first")
    return _db_path


@asynccontextmanager
async def connect() -> AsyncIterator[aiosqlite.Connection]:
    """Fresh connection per operation, foreign keys ON, commits on success."""
    db = await aiosqlite.connect(get_db_path(), timeout=10)
    try:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        yield db
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    finally:
        await db.close()


async def ping() -> None:
    """Trivial query for the health check. Raises if the database is unavailable."""
    async with connect() as db:
        await db.execute("SELECT 1")


async def init_db(db_path: str) -> None:
    """Create parent dir, run schema.sql, remember db_path for the repository."""
    global _db_path
    db_path = str(db_path)
    if db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    _db_path = db_path
    schema = _SCHEMA_PATH.read_text(encoding="utf-8")
    async with connect() as db:
        if db_path != ":memory:":
            await db.execute("PRAGMA journal_mode = WAL")
        await db.executescript(schema)
