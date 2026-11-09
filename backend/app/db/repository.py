"""SQLite repository. Every function opens its own connection (see connection.connect)."""
import json
import secrets
from typing import Any

import aiosqlite

from app.db.connection import connect
from app.db.ids import new_entry_id, new_game_id, new_join_code, new_player_id, next_color
from app.db.rows import AdminSessionRow, EntryRow, GameRow, JoinRequestRow, Mode, Origin, PlayerRow, RemovalRow, SpinRow
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
        kind=r["kind"],
        join_code=r["join_code"],
        join_policy=r["join_policy"],
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


async def _insert_entries(db: aiosqlite.Connection, game_id: str, names: list[str]) -> list[str]:
    """Append entries after the last one, with palette colours. Returns their new IDs."""
    now = utc_now_iso()
    async with db.execute(
        "SELECT COALESCE(MAX(position), -1) FROM entries WHERE game_id = ?", (game_id,)
    ) as cur:
        (max_pos,) = await cur.fetchone()
    async with db.execute(
        "SELECT color FROM entries WHERE game_id = ? ORDER BY position LIMIT 1", (game_id,)
    ) as cur:
        row = await cur.fetchone()
        first = row[0] if row else None
    async with db.execute(
        "SELECT color FROM entries WHERE game_id = ? ORDER BY position DESC LIMIT 1", (game_id,)
    ) as cur:
        row = await cur.fetchone()
        previous = row[0] if row else None
    rows = []
    for i, name in enumerate(names):
        pos = max_pos + 1 + i
        color = next_color(pos, previous, first)
        first = first or color
        previous = color
        rows.append((new_entry_id(), game_id, name, color, pos, now))
    await db.executemany(
        "INSERT INTO entries (id, game_id, name, color, position, is_active, created_at)"
        " VALUES (?, ?, ?, ?, ?, 1, ?)",
        rows,
    )
    return [r[0] for r in rows]


async def add_entries(game_id: str, names: list[str]) -> list[EntryRow]:
    async with connect() as db:
        await _insert_entries(db, game_id, names)
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


async def list_finished_spins(game_id: str, limit: int) -> list[SpinRow]:
    """Newest first. Unfinished spins are excluded: their winner isn't public until the wheel lands."""
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM spins WHERE game_id = ? AND finished_at IS NOT NULL"
            " ORDER BY id DESC LIMIT ?",
            (game_id, limit),
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


# ---------- multiplayer ----------
_PLAYER_SELECT = (
    "SELECT p.id, p.game_id, p.entry_id, e.name, p.avatar, p.is_host, p.joined_at, p.last_seen_at"
    " FROM players p JOIN entries e ON e.id = p.entry_id"
)


def _player(r: aiosqlite.Row) -> PlayerRow:
    return PlayerRow(
        id=r["id"],
        game_id=r["game_id"],
        entry_id=r["entry_id"],
        name=r["name"],
        avatar=r["avatar"],
        is_host=bool(r["is_host"]),
        joined_at=r["joined_at"],
        last_seen_at=r["last_seen_at"],
    )


async def make_multiplayer(game_id: str) -> GameRow | None:
    """Turn a solo game multiplayer with a new, unique join code. No-op if it already is."""
    async with connect() as db:
        game = await _fetch_game(db, game_id)
        if game is None or game.kind == "multiplayer":
            return game
        while True:
            try:
                await db.execute(
                    "UPDATE games SET kind = 'multiplayer', join_code = ? WHERE id = ?",
                    (new_join_code(), game_id),
                )
                break
            except aiosqlite.IntegrityError:
                continue  # code already taken by another game: draw again
        return await _fetch_game(db, game_id)


async def close_multiplayer(game_id: str) -> None:
    """Turn a multiplayer game back into a solo wheel: no code. (Its players are already gone.)"""
    async with connect() as db:
        await db.execute(
            "UPDATE games SET kind = 'solo', join_code = NULL, join_policy = 'open' WHERE id = ?", (game_id,)
        )
        await db.execute("DELETE FROM player_removals WHERE game_id = ?", (game_id,))
        await db.execute("DELETE FROM join_requests WHERE game_id = ?", (game_id,))


async def count_players(game_id: str) -> int:
    async with connect() as db:
        async with db.execute("SELECT COUNT(*) FROM players WHERE game_id = ?", (game_id,)) as cur:
            (n,) = await cur.fetchone()
    return n


async def game_id_for_code(code: str) -> str | None:
    async with connect() as db:
        async with db.execute(
            "SELECT id FROM games WHERE join_code = ? AND kind = 'multiplayer'", (code,)
        ) as cur:
            r = await cur.fetchone()
    return r["id"] if r else None


async def add_player(game_id: str, *, name: str, avatar: str, is_host: bool,
                     token_hash: str) -> PlayerRow:
    """Add the player's entry to the wheel and the player, in one transaction."""
    now = utc_now_iso()
    async with connect() as db:
        (entry_id,) = await _insert_entries(db, game_id, [name])
        pid = new_player_id()
        await db.execute(
            "INSERT INTO players (id, game_id, entry_id, avatar, is_host, token_hash, joined_at,"
            " last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (pid, game_id, entry_id, avatar, 1 if is_host else 0, token_hash, now, now),
        )
        async with db.execute(_PLAYER_SELECT + " WHERE p.id = ?", (pid,)) as cur:
            return _player(await cur.fetchone())


async def list_players(game_id: str) -> list[PlayerRow]:
    async with connect() as db:
        async with db.execute(
            _PLAYER_SELECT + " WHERE p.game_id = ? ORDER BY p.joined_at, p.rowid", (game_id,)
        ) as cur:
            return [_player(r) for r in await cur.fetchall()]


async def get_player(game_id: str, player_id: str) -> PlayerRow | None:
    async with connect() as db:
        async with db.execute(
            _PLAYER_SELECT + " WHERE p.game_id = ? AND p.id = ?", (game_id, player_id)
        ) as cur:
            r = await cur.fetchone()
    return _player(r) if r else None


async def player_by_token_hash(game_id: str, token_hash: str) -> PlayerRow | None:
    async with connect() as db:
        async with db.execute(
            _PLAYER_SELECT + " WHERE p.game_id = ? AND p.token_hash = ?", (game_id, token_hash)
        ) as cur:
            r = await cur.fetchone()
    return _player(r) if r else None


async def player_for_entry(game_id: str, entry_id: str) -> PlayerRow | None:
    async with connect() as db:
        async with db.execute(
            _PLAYER_SELECT + " WHERE p.game_id = ? AND p.entry_id = ?", (game_id, entry_id)
        ) as cur:
            r = await cur.fetchone()
    return _player(r) if r else None


async def remove_player(game_id: str, player_id: str, reason: str | None = None) -> bool:
    """Delete the player's entry; the player row goes with it (ON DELETE CASCADE). With a `reason`
    (kicked, banned, timed_out), remember it for the key their browser still holds."""
    async with connect() as db:
        if reason is not None:
            await db.execute(
                "INSERT OR REPLACE INTO player_removals (game_id, token_hash, player_id, name, avatar,"
                " reason, removed_at)"
                " SELECT p.game_id, p.token_hash, p.id, e.name, p.avatar, ?, ?"
                " FROM players p JOIN entries e ON e.id = p.entry_id WHERE p.game_id = ? AND p.id = ?",
                (reason, utc_now_iso(), game_id, player_id),
            )
        cur = await db.execute(
            "DELETE FROM entries WHERE id = (SELECT entry_id FROM players WHERE game_id = ? AND id = ?)",
            (game_id, player_id),
        )
        return cur.rowcount > 0


async def set_host(game_id: str, player_id: str | None) -> None:
    """Make `player_id` the only host of the game (None: nobody)."""
    async with connect() as db:
        await db.execute("UPDATE players SET is_host = 0 WHERE game_id = ?", (game_id,))
        if player_id is not None:
            await db.execute("UPDATE players SET is_host = 1 WHERE game_id = ? AND id = ?",
                             (game_id, player_id))


async def touch_player(player_id: str) -> None:
    async with connect() as db:
        await db.execute("UPDATE players SET last_seen_at = ? WHERE id = ?", (utc_now_iso(), player_id))


async def players_last_seen_before(cutoff: str) -> list[PlayerRow]:
    async with connect() as db:
        async with db.execute(
            _PLAYER_SELECT + " WHERE p.last_seen_at < ? ORDER BY p.game_id, p.joined_at", (cutoff,)
        ) as cur:
            return [_player(r) for r in await cur.fetchall()]


# ---------- removals, requests to join and the join policy ----------
def _removal(r: aiosqlite.Row) -> RemovalRow:
    return RemovalRow(
        game_id=r["game_id"], player_id=r["player_id"], name=r["name"], avatar=r["avatar"],
        reason=r["reason"], removed_at=r["removed_at"],
    )


def _request(r: aiosqlite.Row) -> JoinRequestRow:
    return JoinRequestRow(
        game_id=r["game_id"], token_hash=r["token_hash"], player_id=r["player_id"], name=r["name"],
        avatar=r["avatar"], state=r["state"], created_at=r["created_at"], invited=bool(r["invited"]),
    )


async def removal_by_token_hash(game_id: str, token_hash: str) -> RemovalRow | None:
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM player_removals WHERE game_id = ? AND token_hash = ?", (game_id, token_hash)
        ) as cur:
            r = await cur.fetchone()
    return _removal(r) if r else None


async def request_by_token_hash(game_id: str, token_hash: str) -> JoinRequestRow | None:
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM join_requests WHERE game_id = ? AND token_hash = ?", (game_id, token_hash)
        ) as cur:
            r = await cur.fetchone()
    return _request(r) if r else None


async def request_by_player(game_id: str, player_id: str) -> JoinRequestRow | None:
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM join_requests WHERE game_id = ? AND player_id = ?", (game_id, player_id)
        ) as cur:
            r = await cur.fetchone()
    return _request(r) if r else None


async def open_requests(game_id: str) -> list[JoinRequestRow]:
    """Pending and accepted (waiting for the player) requests, oldest first."""
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM join_requests WHERE game_id = ? AND state IN ('pending','accepted')"
            " ORDER BY created_at, rowid",
            (game_id,),
        ) as cur:
            return [_request(r) for r in await cur.fetchall()]


async def add_request(game_id: str, *, token_hash: str, player_id: str, name: str, avatar: str,
                      invited: bool = False) -> None:
    """A request to join: 'pending' (asked), or straight to 'accepted' when the host invites."""
    async with connect() as db:
        await db.execute(
            "INSERT OR REPLACE INTO join_requests (game_id, token_hash, player_id, name, avatar, state,"
            " invited, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (game_id, token_hash, player_id, name, avatar, "accepted" if invited else "pending",
             1 if invited else 0, utc_now_iso()),
        )


async def set_request_state(game_id: str, player_id: str, state: str) -> None:
    async with connect() as db:
        await db.execute(
            "UPDATE join_requests SET state = ? WHERE game_id = ? AND player_id = ?", (state, game_id, player_id)
        )


async def delete_request(game_id: str, token_hash: str) -> None:
    async with connect() as db:
        await db.execute("DELETE FROM join_requests WHERE game_id = ? AND token_hash = ?", (game_id, token_hash))


async def add_known_player(game_id: str, *, token_hash: str, player_id: str, name: str,
                           avatar: str) -> PlayerRow:
    """Add a player whose ID and key already exist (a returning player, or an accepted request).
    Their removal and request, if any, are forgotten."""
    now = utc_now_iso()
    async with connect() as db:
        (entry_id,) = await _insert_entries(db, game_id, [name])
        await db.execute(
            "INSERT INTO players (id, game_id, entry_id, avatar, is_host, token_hash, joined_at,"
            " last_seen_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
            (player_id, game_id, entry_id, avatar, token_hash, now, now),
        )
        await db.execute("DELETE FROM player_removals WHERE game_id = ? AND token_hash = ?", (game_id, token_hash))
        await db.execute("DELETE FROM join_requests WHERE game_id = ? AND token_hash = ?", (game_id, token_hash))
        async with db.execute(_PLAYER_SELECT + " WHERE p.id = ?", (player_id,)) as cur:
            return _player(await cur.fetchone())


async def set_join_policy(game_id: str, policy: str) -> None:
    async with connect() as db:
        await db.execute("UPDATE games SET join_policy = ? WHERE id = ?", (policy, game_id))


async def removal_by_player(game_id: str, player_id: str) -> RemovalRow | None:
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM player_removals WHERE game_id = ? AND player_id = ?", (game_id, player_id)
        ) as cur:
            r = await cur.fetchone()
    return _removal(r) if r else None


async def removal_token_hash(game_id: str, player_id: str) -> str | None:
    async with connect() as db:
        async with db.execute(
            "SELECT token_hash FROM player_removals WHERE game_id = ? AND player_id = ?", (game_id, player_id)
        ) as cur:
            r = await cur.fetchone()
    return r["token_hash"] if r else None


async def list_removed(game_id: str) -> list[tuple[RemovalRow, bool]]:
    """Kicked and banned players (not those who were away too long), each with whether the host
    has invited them back."""
    async with connect() as db:
        async with db.execute(
            "SELECT r.*, EXISTS (SELECT 1 FROM join_requests q WHERE q.game_id = r.game_id"
            " AND q.token_hash = r.token_hash AND q.invited = 1) AS invited"
            " FROM player_removals r WHERE r.game_id = ? AND r.reason IN ('kicked','banned')"
            " ORDER BY r.removed_at DESC",
            (game_id,),
        ) as cur:
            return [(_removal(r), bool(r["invited"])) for r in await cur.fetchall()]


async def set_removal_reason(game_id: str, player_id: str, reason: str) -> None:
    async with connect() as db:
        await db.execute(
            "UPDATE player_removals SET reason = ? WHERE game_id = ? AND player_id = ?", (reason, game_id, player_id)
        )


async def forget_removal(game_id: str, player_id: str) -> None:
    """Forget that a player was removed (and any request of theirs): they're a stranger again."""
    async with connect() as db:
        await db.execute(
            "DELETE FROM join_requests WHERE game_id = ? AND token_hash ="
            " (SELECT token_hash FROM player_removals WHERE game_id = ? AND player_id = ?)",
            (game_id, game_id, player_id),
        )
        await db.execute("DELETE FROM player_removals WHERE game_id = ? AND player_id = ?", (game_id, player_id))


# ---------------------------------------------------------------- admin sessions
async def list_admin_sessions() -> list[AdminSessionRow]:
    async with connect() as db:
        async with db.execute(
            "SELECT id, token_hash, device, created_at, last_used_at FROM admin_sessions"
        ) as cur:
            return [AdminSessionRow(**dict(r)) for r in await cur.fetchall()]


async def add_admin_session(session_id: str, *, token_hash: str, device: str, created_at: str,
                            last_used_at: str) -> None:
    async with connect() as db:
        await db.execute(
            "INSERT INTO admin_sessions (id, token_hash, device, created_at, last_used_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (session_id, token_hash, device, created_at, last_used_at),
        )


async def touch_admin_session(session_id: str, last_used_at: str) -> None:
    async with connect() as db:
        await db.execute("UPDATE admin_sessions SET last_used_at = ? WHERE id = ?", (last_used_at, session_id))


async def delete_admin_session(session_id: str) -> None:
    async with connect() as db:
        await db.execute("DELETE FROM admin_sessions WHERE id = ?", (session_id,))
