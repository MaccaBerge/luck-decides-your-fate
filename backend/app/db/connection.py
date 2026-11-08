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
        await _add_missing_game_columns(db)
        await db.executescript(schema)
        await _add_missing_request_columns(db)
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_games_join_code ON games(join_code)"
            " WHERE join_code IS NOT NULL"
        )


async def _add_missing_request_columns(db: aiosqlite.Connection) -> None:
    """join_requests made before invitations lack the invited column."""
    async with db.execute("PRAGMA table_info(join_requests)") as cur:
        columns = {r[1] for r in await cur.fetchall()}
    if "invited" not in columns:
        await db.execute("ALTER TABLE join_requests ADD COLUMN invited INTEGER NOT NULL DEFAULT 0")


async def _add_missing_game_columns(db: aiosqlite.Connection) -> None:
    """Databases created before multiplayer lack games.kind and games.join_code."""
    async with db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='games'") as cur:
        if await cur.fetchone() is None:
            return  # a new database: schema.sql creates the table with every column
    async with db.execute("PRAGMA table_info(games)") as cur:
        columns = {r[1] for r in await cur.fetchall()}
    if "kind" not in columns:
        await db.execute(
            "ALTER TABLE games ADD COLUMN kind TEXT NOT NULL DEFAULT 'solo'"
            " CHECK (kind IN ('solo','multiplayer'))"
        )
    if "join_code" not in columns:
        await db.execute("ALTER TABLE games ADD COLUMN join_code TEXT")
    if "join_policy" not in columns:
        await db.execute(
            "ALTER TABLE games ADD COLUMN join_policy TEXT NOT NULL DEFAULT 'open'"
            " CHECK (join_policy IN ('open','ask','closed'))"
        )
