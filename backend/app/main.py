"""FastAPI application. Run with a single worker:

    ADMIN_PASSWORD=... uvicorn app.main:app --workers 1
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import APIRouter, FastAPI

from app.auth import SessionStore
from app.config import (
    MIN_RECOMMENDED_PASSWORD_LENGTH,
    ConfigError,
    Settings,
    config_summary,
    load_settings,
)
from app.context import AppContext
from app.db import repository as repo
from app.db.connection import init_db
from app.errors import install_error_handlers
from app.middleware import ResponseHeadersMiddleware
from app.routes import admin, games, static, ws
from app.services import views
from app.services.cleanup import cleanup_loop
from app.services.rate_limit import LoginRateLimiter

log = logging.getLogger("app")


def _configure_logging() -> None:
    """Uvicorn only configures its own loggers, so `app.*` needs a handler to reach the logs."""
    if not log.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
        log.addHandler(handler)
    log.setLevel(logging.INFO)


def _attach(app: FastAPI, router: APIRouter) -> None:
    """Add a router's routes to the app as flat routes.

    Newer FastAPI versions wrap included routers (`_IncludedRouter`), which hides `.path` /
    `.methods` from `app.routes` and breaks the §12.5 contract-diff listing. Our routers carry
    their full paths and dependencies already (prefix/dependencies are applied per route), so the
    routes can be attached directly.
    """
    app.router.routes.extend(router.routes)


def create_app(settings: Settings | None = None, *, run_cleanup: bool = True) -> FastAPI:
    if settings is None:
        settings = load_settings()

    ctx = AppContext(
        settings=settings,
        sessions=SessionStore(settings.admin_password),
        login_limiter=LoginRateLimiter(
            settings.login_rate_limit_attempts, settings.login_rate_limit_window_seconds
        ),
    )
    ctx.manager.set_dashboard_builder(lambda: views.dashboard_payload(ctx))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        log.info(config_summary(settings, frontend_served=app.state.frontend_dist is not None))
        if len(settings.admin_password) < MIN_RECOMMENDED_PASSWORD_LENGTH:
            log.warning(
                "ADMIN_PASSWORD is shorter than %d characters; use a longer one in production",
                MIN_RECOMMENDED_PASSWORD_LENGTH,
            )
        await init_db(settings.database_path)
        finished = await repo.finish_dangling_spins()
        if finished:
            log.info("marked %d interrupted spin(s) as finished", finished)
        cleanup_task = asyncio.create_task(cleanup_loop(ctx)) if run_cleanup else None
        try:
            yield
        finally:
            if cleanup_task is not None:
                cleanup_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await cleanup_task
            await ctx.runtime.shutdown()
            await ctx.manager.shutdown()

    app = FastAPI(
        title="Luck Decides Your Fate",
        redirect_slashes=False,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.ctx = ctx
    install_error_handlers(app)
    app.add_middleware(ResponseHeadersMiddleware)

    for router in (games.router, admin.router, admin.protected, ws.router, static.router):
        _attach(app, router)
    static.mount_static(app, settings.frontend_dist)  # LAST: API + WS routes take precedence
    return app


def _create_default_app() -> FastAPI:
    _configure_logging()
    try:
        return create_app()
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from None


app = _create_default_app()
