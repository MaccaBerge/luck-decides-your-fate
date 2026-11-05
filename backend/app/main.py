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
from app.config import ConfigError, Settings, load_settings
from app.context import AppContext
from app.db import repository as repo
from app.db.connection import init_db
from app.errors import install_error_handlers
from app.routes import admin, games, static, ws
from app.services import views
from app.services.cleanup import cleanup_loop

log = logging.getLogger("app")


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

    ctx = AppContext(settings=settings, sessions=SessionStore(settings.admin_password))
    ctx.manager.set_dashboard_builder(lambda: views.dashboard_payload(ctx))

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
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

    for router in (games.router, admin.router, admin.protected, ws.router):
        _attach(app, router)
    static.mount_static(app, settings.frontend_dist)  # LAST: API + WS routes take precedence
    return app


def _create_default_app() -> FastAPI:
    try:
        return create_app()
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from None


app = _create_default_app()
