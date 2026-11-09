"""Admin authentication: one password, long-lived sessions kept in the database.

A session lasts until it has gone unused for IDLE_DAYS, and at most MAX_DAYS after the login.
Sessions survive restarts and deploys: they're stored in `admin_sessions` and loaded into memory
at startup, so checking one never waits on the database (admin sockets check synchronously).

Only an HMAC of each token is stored, keyed with ADMIN_PASSWORD. A copy of the database (a
backup) therefore holds nothing that logs anyone in, and changing the password ends every session.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone

from fastapi import Request
from starlette.requests import HTTPConnection

from app.db import repository as repo
from app.errors import unauthorized
from app.timeutil import utc_iso

COOKIE_NAME = "admin_session"
IDLE_DAYS = 60
MAX_DAYS = 365
# How stale `last_used_at` may get before a request moves it forward (saves a write per request).
TOUCH_EVERY = timedelta(hours=1)
SESSION_COOKIE_MAX_AGE = MAX_DAYS * 24 * 60 * 60
DEVICE_LABEL_MAX = 80


@dataclass(frozen=True)
class Session:
    id: str
    device: str
    created_at: datetime
    last_used_at: datetime

    def expires_at(self) -> datetime:
        """The earlier of the idle limit and the hard limit."""
        return min(self.last_used_at + timedelta(days=IDLE_DAYS), self.created_at + timedelta(days=MAX_DAYS))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def device_label(user_agent: str | None) -> str:
    """A short, human description of the browser that logged in ("iPhone · Safari")."""
    ua = user_agent or ""
    if "iPhone" in ua:
        device = "iPhone"
    elif "iPad" in ua:
        device = "iPad"
    elif "Android" in ua:
        device = "Android"
    elif "Macintosh" in ua or "Mac OS X" in ua:
        device = "Mac"
    elif "Windows" in ua:
        device = "Windows"
    elif "Linux" in ua:
        device = "Linux"
    else:
        device = "Unknown device"
    if "Edg/" in ua:
        browser = "Edge"
    elif "Firefox/" in ua or "FxiOS/" in ua:
        browser = "Firefox"
    elif "Chrome/" in ua or "CriOS/" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    elif device in ("iPhone", "iPad"):
        browser = "Home Screen app"  # a standalone web app's user agent has no "Safari/"
    else:
        browser = ""
    return (f"{device} · {browser}" if browser else device)[:DEVICE_LABEL_MAX]


class SessionStore:
    def __init__(self, password: str) -> None:
        self._password = password.encode("utf-8")
        self._sessions: dict[str, Session] = {}  # token hash -> session

    def check_password(self, candidate: str) -> bool:
        return secrets.compare_digest(candidate.encode("utf-8"), self._password)

    def _hash(self, token: str) -> str:
        return hmac.new(self._password, token.encode("utf-8"), hashlib.sha256).hexdigest()

    async def load(self) -> None:
        """At startup: read the stored sessions, and delete expired ones and any made with
        another password (their hashes can't match any more)."""
        self._sessions = {}
        now = _now()
        for row in await repo.list_admin_sessions():
            s = Session(row.id, row.device, _parse(row.created_at), _parse(row.last_used_at))
            if s.expires_at() <= now:
                await repo.delete_admin_session(s.id)
            else:
                self._sessions[row.token_hash] = s

    async def create(self, device: str) -> str:
        await self._purge()
        token = secrets.token_urlsafe(32)
        now = _now()
        session = Session(secrets.token_urlsafe(9), device, now, now)
        token_hash = self._hash(token)
        await repo.add_admin_session(
            session.id, token_hash=token_hash, device=device, created_at=utc_iso(now), last_used_at=utc_iso(now)
        )
        self._sessions[token_hash] = session
        return token

    def get(self, token: str | None) -> Session | None:
        if not token:
            return None
        session = self._sessions.get(self._hash(token))
        if session is None or session.expires_at() <= _now():
            return None
        return session

    def is_valid(self, token: str | None) -> bool:
        return self.get(token) is not None

    async def touch(self, token: str | None) -> None:
        """A request with this session: it was used now (written at most once per TOUCH_EVERY)."""
        session = self.get(token)
        if session is None or _now() - session.last_used_at < TOUCH_EVERY:
            return
        now = _now()
        self._sessions[self._hash(token or "")] = replace(session, last_used_at=now)
        await repo.touch_admin_session(session.id, utc_iso(now))

    def list(self) -> list[Session]:
        now = _now()
        return sorted(
            (s for s in self._sessions.values() if s.expires_at() > now),
            key=lambda s: s.last_used_at,
            reverse=True,
        )

    async def revoke(self, token: str | None) -> None:
        if not token:
            return
        session = self._sessions.pop(self._hash(token), None)
        if session is not None:
            await repo.delete_admin_session(session.id)

    async def revoke_id(self, session_id: str) -> bool:
        for token_hash, s in list(self._sessions.items()):
            if s.id == session_id:
                del self._sessions[token_hash]
                await repo.delete_admin_session(session_id)
                return True
        return False

    async def revoke_others(self, token: str | None) -> int:
        """Sign out everywhere else: every session but this one."""
        keep = self._hash(token) if token else None
        others = [h for h in self._sessions if h != keep]
        for token_hash in others:
            await repo.delete_admin_session(self._sessions.pop(token_hash).id)
        return len(others)

    async def _purge(self) -> None:
        now = _now()
        for token_hash, s in list(self._sessions.items()):
            if s.expires_at() <= now:
                del self._sessions[token_hash]
                await repo.delete_admin_session(s.id)


def session_token(conn: HTTPConnection) -> str | None:
    return conn.cookies.get(COOKIE_NAME)


def is_admin(conn: HTTPConnection) -> bool:
    store: SessionStore = conn.app.state.ctx.sessions
    return store.is_valid(session_token(conn))


async def require_admin(request: Request) -> None:
    """FastAPI dependency for admin routes. Using the controller keeps its session alive."""
    store: SessionStore = request.app.state.ctx.sessions
    token = session_token(request)
    if not store.is_valid(token):
        raise unauthorized()
    await store.touch(token)
