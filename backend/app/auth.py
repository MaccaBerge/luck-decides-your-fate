"""Admin authentication: one password, in-memory session tokens (a restart logs the admin out)."""
from __future__ import annotations

import secrets
import time

from fastapi import Request
from starlette.requests import HTTPConnection

from app.errors import unauthorized

COOKIE_NAME = "admin_session"
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60


class SessionStore:
    def __init__(self, password: str) -> None:
        self._password = password.encode("utf-8")
        self._sessions: dict[str, float] = {}  # token -> expiry (unix seconds)

    def check_password(self, candidate: str) -> bool:
        return secrets.compare_digest(candidate.encode("utf-8"), self._password)

    def create(self) -> str:
        self._purge()
        token = secrets.token_urlsafe(32)
        self._sessions[token] = time.time() + SESSION_TTL_SECONDS
        return token

    def is_valid(self, token: str | None) -> bool:
        if not token:
            return False
        expiry = self._sessions.get(token)
        if expiry is None:
            return False
        if expiry < time.time():
            self._sessions.pop(token, None)
            return False
        return True

    def revoke(self, token: str | None) -> None:
        if token:
            self._sessions.pop(token, None)

    def _purge(self) -> None:
        now = time.time()
        for token in [t for t, exp in self._sessions.items() if exp < now]:
            self._sessions.pop(token, None)


def session_token(conn: HTTPConnection) -> str | None:
    return conn.cookies.get(COOKIE_NAME)


def is_admin(conn: HTTPConnection) -> bool:
    store: SessionStore = conn.app.state.ctx.sessions
    return store.is_valid(session_token(conn))


async def require_admin(request: Request) -> None:
    """FastAPI dependency for admin routes."""
    if not is_admin(request):
        raise unauthorized()
