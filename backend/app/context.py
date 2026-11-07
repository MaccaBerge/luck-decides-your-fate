"""Per-application live context, stored on ``app.state.ctx``."""
from __future__ import annotations

import secrets
from dataclasses import dataclass, field

from fastapi import Request
from starlette.requests import HTTPConnection

from app.auth import SessionStore
from app.config import Settings
from app.realtime.manager import ConnectionManager
from app.services.backup import BackupStatus
from app.services.rate_limit import LoginRateLimiter
from app.services.state import RuntimeRegistry
from app.services.tickets import TicketStore


@dataclass
class AppContext:
    settings: Settings
    sessions: SessionStore
    login_limiter: LoginRateLimiter
    manager: ConnectionManager = field(default_factory=ConnectionManager)
    runtime: RuntimeRegistry = field(default_factory=RuntimeRegistry)
    rng: secrets.SystemRandom = field(default_factory=secrets.SystemRandom)
    backup_status: BackupStatus = field(default_factory=BackupStatus)
    tickets: TicketStore = field(default_factory=TicketStore)


def get_ctx(conn: HTTPConnection) -> AppContext:
    return conn.app.state.ctx


def ctx_dep(request: Request) -> AppContext:
    """FastAPI dependency."""
    return request.app.state.ctx
