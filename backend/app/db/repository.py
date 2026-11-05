"""SQLite repository. Every function opens its own connection (see connection.connect)."""
import json
import secrets
from typing import Any

import aiosqlite

from app.db.connection import connect
from app.db.ids import PALETTE, new_entry_id, new_game_id
from app.db.rows import EntryRow, GameRow, Mode, Origin, SpinRow
from app.timeutil import utc_iso_days_ago, utc_now_iso


class _Unset:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __repr__(self) -> str:
        return "UNSET"


UNSET: Any = _Unset()


# ---------- row mapping ----------
def _game(r: aiosqlite.Row) -> GameRow:
    return GameRow(
        id=r["id"],
        game_type=r["game_type"],
        origin=r["origin"],
        label=r["label"],
        mode=r["mode"],
        target_names=list(json.loads(r["target_names"] or "[]")),
        remove_winner=bool(r["remove_winner"]),
        created_at=r["created_at"],
        first_opened_at=r["first_opened_at"],
        last_activity_at=r["last_activity_at"],
    )


def _entry(r: aiosqlite.Row) -> EntryRow:
    return EntryRow(
        id=r["id"],
        game_id=r["game_id"],
        name=r["name"],
        color=r["color"],
        position=r["position"],
        is_active=bool(r["is_active"]),
        created_at=r["created_at"],
    )


def _spin(r: aiosqlite.Row) -> SpinRow:
    return SpinRow(
        id=r["id"],
        game_id=r["game_id"],
        winner_entry_id=r["winner_entry_id"],
        winner_name=r["winner_name"],
        mode=r["mode"],
        rule_applied=bool(r["rule_applied"]),
        started_at=r["started_at"],
        finished_at=r["finished_at"],
    )


async def _fetch_game(db: aiosqlite.Connection, game_id: str) -> GameRow | None:
    async with db.execute("SELECT * FROM games WHERE id = ?", (game_id,)) as cur:
        r = await cur.fetchone()
    return _game(r) if r else None


async def _fetch_entries(db: aiosqlite.Connection, game_id: str) -> list[EntryRow]:
    async with db.execute(
        "SELECT * FROM entries WHERE game_id = ? ORDER BY position ASC, created_at ASC",
        (game_id,),
    ) as cur:
        return [_entry(r) for r in await cur.fetchall()]


async def _fetch_spin(db: aiosqlite.Connection, spin_id: int) -> SpinRow | None:
    async with db.execute("SELECT * FROM spins WHERE id = ?", (spin_id,)) as cur:
        r = await cur.fetchone()
    return _spin(r) if r else None


# ---------- games ----------
async def create_game(origin: Origin, *, label: str | None = None,
                      mode: Mode = "fair", target_names: list[str] | None = None) -> GameRow:
    now = utc_now_iso()
    targets = json.dumps(list(target_names or []))
    async with connect() as db:
        while True:
            gid = new_game_id()
            try:
                await db.execute(
                    "INSERT INTO games (id, game_type, origin, label, mode, target_names,"
                    " remove_winner, created_at, first_opened_at, last_activity_at)"
                    " VALUES (?, 'wheel', ?, ?, ?, ?, 0, ?, NULL, ?)",
                    (gid, origin, label, mode, targets, now, now),
                )
                break
            except aiosqlite.IntegrityError:
                # id collision (astronomically unlikely) -> retry; re-raise other violations
                if await _fetch_game(db, gid) is None:
                    raise
        game = await _fetch_game(db, gid)
    assert game is not None
    return game


async def get_game(game_id: str) -> GameRow | None:
    async with connect() as db:
        return await _fetch_game(db, game_id)


async def delete_game(game_id: str) -> bool:
    async with connect() as db:
        cur = await db.execute("DELETE FROM games WHERE id = ?", (game_id,))
        return cur.rowcount > 0


async def touch_game(game_id: str) -> None:
    async with connect() as db:
        await db.execute("UPDATE games SET last_activity_at = ? WHERE id = ?",
                         (utc_now_iso(), game_id))


async def mark_opened(game_id: str) -> None:
    now = utc_now_iso()
    async with connect() as db:
        await db.execute(
            "UPDATE games SET first_opened_at = COALESCE(first_opened_at, ?),"
            " last_activity_at = ? WHERE id = ?",
            (now, now, game_id),
        )


async def list_admin_links() -> list[GameRow]:
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM games WHERE origin = 'admin_link'"
            " ORDER BY created_at DESC, rowid DESC"
        ) as cur:
            return [_game(r) for r in await cur.fetchall()]


async def update_rules(game_id: str, *, label=UNSET, mode=UNSET,
                       target_names=UNSET) -> GameRow | None:
    sets: list[str] = []
    params: list[Any] = []
    if label is not UNSET:
        sets.append("label = ?")
        params.append(label)          # None clears the label
    if mode is not UNSET:
        sets.append("mode = ?")
        params.append(mode)
    if target_names is not UNSET:
        sets.append("target_names = ?")
        params.append(json.dumps(list(target_names or [])))
    async with connect() as db:
        if sets:
            await db.execute(f"UPDATE games SET {', '.join(sets)} WHERE id = ?",
                             (*params, game_id))
        return await _fetch_game(db, game_id)


async def update_settings(game_id: str, *, remove_winner: bool) -> GameRow | None:
    async with connect() as db:
        await db.execute("UPDATE games SET remove_winner = ? WHERE id = ?",
                         (1 if remove_winner else 0, game_id))
        return await _fetch_game(db, game_id)


# ---------- entries ----------
async def list_entries(game_id: str) -> list[EntryRow]:
    async with connect() as db:
        return await _fetch_entries(db, game_id)


async def add_entries(game_id: str, names: list[str]) -> list[EntryRow]:
    now = utc_now_iso()
    async with connect() as db:
        async with db.execute(
            "SELECT COALESCE(MAX(position), -1) FROM entries WHERE game_id = ?", (game_id,)
        ) as cur:
            (max_pos,) = await cur.fetchone()
        rows = []
        for i, name in enumerate(names):
            pos = max_pos + 1 + i
            rows.append((new_entry_id(), game_id, name, PALETTE[pos % len(PALETTE)], pos, now))
        await db.executemany(
            "INSERT INTO entries (id, game_id, name, color, position, is_active, created_at)"
            " VALUES (?, ?, ?, ?, ?, 1, ?)",
            rows,
        )
        return await _fetch_entries(db, game_id)


async def update_entry(game_id: str, entry_id: str, *, name=UNSET, color=UNSET,
                       is_active=UNSET) -> EntryRow | None:
    sets: list[str] = []
    params: list[Any] = []
    if name is not UNSET:
        sets.append("name = ?")
        params.append(name)
    if color is not UNSET:
        sets.append("color = ?")
        params.append(color)
    if is_active is not UNSET:
        sets.append("is_active = ?")
        params.append(1 if is_active else 0)
    async with connect() as db:
        if sets:
            await db.execute(
                f"UPDATE entries SET {', '.join(sets)} WHERE id = ? AND game_id = ?",
                (*params, entry_id, game_id),
            )
        async with db.execute(
            "SELECT * FROM entries WHERE id = ? AND game_id = ?", (entry_id, game_id)
        ) as cur:
            r = await cur.fetchone()
        return _entry(r) if r else None


async def delete_entry(game_id: str, entry_id: str) -> bool:
    async with connect() as db:
        cur = await db.execute("DELETE FROM entries WHERE id = ? AND game_id = ?",
                               (entry_id, game_id))
        return cur.rowcount > 0


async def shuffle_entries(game_id: str) -> list[EntryRow]:
    """Assign a random permutation of positions 0..n-1 (secrets.SystemRandom)."""
    async with connect() as db:
        entries = await _fetch_entries(db, game_id)
        positions = list(range(len(entries)))
        secrets.SystemRandom().shuffle(positions)
        await db.executemany(
            "UPDATE entries SET position = ? WHERE id = ?",
            [(p, e.id) for p, e in zip(positions, entries)],
        )
        return await _fetch_entries(db, game_id)


async def restore_entries(game_id: str) -> list[EntryRow]:
    async with connect() as db:
        await db.execute("UPDATE entries SET is_active = 1 WHERE game_id = ?", (game_id,))
        return await _fetch_entries(db, game_id)


# ---------- spins ----------
async def record_spin(game_id: str, *, winner_entry_id: str, winner_name: str,
                      mode: Mode, rule_applied: bool) -> SpinRow:
    async with connect() as db:
        cur = await db.execute(
            "INSERT INTO spins (game_id, winner_entry_id, winner_name, mode, rule_applied,"
            " started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
            (game_id, winner_entry_id, winner_name, mode, 1 if rule_applied else 0,
             utc_now_iso()),
        )
        spin = await _fetch_spin(db, cur.lastrowid)
    assert spin is not None
    return spin


async def finish_spin(spin_id: int) -> SpinRow:
    async with connect() as db:
        await db.execute(
            "UPDATE spins SET finished_at = COALESCE(finished_at, ?) WHERE id = ?",
            (utc_now_iso(), spin_id),
        )
        spin = await _fetch_spin(db, spin_id)
    if spin is None:
        raise LookupError(f"spin {spin_id} not found")
    return spin


async def list_spins(game_id: str, limit: int = 50) -> list[SpinRow]:
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM spins WHERE game_id = ? ORDER BY id DESC LIMIT ?", (game_id, limit)
        ) as cur:
            return [_spin(r) for r in await cur.fetchall()]


async def get_last_finished_spin(game_id: str) -> SpinRow | None:
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM spins WHERE game_id = ? AND finished_at IS NOT NULL"
            " ORDER BY id DESC LIMIT 1",
            (game_id,),
        ) as cur:
            r = await cur.fetchone()
        return _spin(r) if r else None


async def finish_dangling_spins() -> int:
    async with connect() as db:
        cur = await db.execute("UPDATE spins SET finished_at = ? WHERE finished_at IS NULL",
                               (utc_now_iso(),))
        return cur.rowcount


async def delete_inactive_public_games(older_than_days: int) -> list[str]:
    """Delete origin='public' games idle for > N days. NEVER deletes admin links."""
    cutoff = utc_iso_days_ago(older_than_days)
    async with connect() as db:
        # single atomic statement: a game touched concurrently is never deleted
        async with db.execute(
            "DELETE FROM games WHERE origin = 'public' AND last_activity_at < ? RETURNING id",
            (cutoff,),
        ) as cur:
            return [r["id"] for r in await cur.fetchall()]
