"""Admin REST API (§8.2). Never calls mark_opened; rule changes never reach player sockets."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from app.auth import COOKIE_NAME, SESSION_TTL_SECONDS, require_admin, session_token
from app.context import AppContext, ctx_dep
from app.db import repository as repo
from app.db.rows import GameRow
from app.errors import game_not_found, invalid_password, validation_error
from app.models import (
    AdminGameState,
    CreateLinkRequest,
    Dashboard,
    LoginRequest,
    UpdateLinkRequest,
)
from app.services import serializers as ser
from app.services import views

router = APIRouter(prefix="/api/admin")
protected = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])

MAX_LABEL_LEN = 60
MAX_TARGET_LEN = 40
MAX_TARGETS = 20


def clean_label(label: str | None) -> str | None:
    if label is None:
        return None
    cleaned = label.strip()
    if len(cleaned) > MAX_LABEL_LEN:
        raise validation_error(f"label: Labels can be at most {MAX_LABEL_LEN} characters")
    return cleaned or None


def clean_targets(targets: list[str]) -> list[str]:
    if len(targets) > MAX_TARGETS:
        raise validation_error(f"target_names: At most {MAX_TARGETS} target names")
    cleaned = [t.strip() for t in targets]
    cleaned = [t for t in cleaned if t]
    if any(len(t) > MAX_TARGET_LEN for t in cleaned):
        raise validation_error(f"target_names: Names can be at most {MAX_TARGET_LEN} characters")
    return cleaned


async def load_link(game_id: str) -> GameRow:
    game = await repo.get_game(game_id)
    if game is None or game.origin != "admin_link":
        raise game_not_found()
    return game


# ---------------------------------------------------------------- session
@router.post("/login")
async def login(body: LoginRequest, response: Response, ctx: AppContext = Depends(ctx_dep)) -> dict:
    if not ctx.sessions.check_password(body.password):
        raise invalid_password()
    token = ctx.sessions.create()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_TTL_SECONDS,
        path="/",
        httponly=True,
        samesite="lax",
        secure=ctx.settings.cookie_secure,
    )
    return {"ok": True}


@protected.post("/logout", status_code=204)
async def logout(request: Request, ctx: AppContext = Depends(ctx_dep)) -> Response:
    ctx.sessions.revoke(session_token(request))
    response = Response(status_code=204)
    response.delete_cookie(
        COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=ctx.settings.cookie_secure
    )
    return response


@protected.get("/me")
async def me() -> dict:
    return {"authenticated": True}


# ---------------------------------------------------------------- dashboard + links
@protected.get("/dashboard", response_model=Dashboard)
async def dashboard(ctx: AppContext = Depends(ctx_dep)) -> Dashboard:
    return await views.dashboard(ctx)


@protected.post("/links", status_code=201, response_model=AdminGameState)
async def create_link(body: CreateLinkRequest, ctx: AppContext = Depends(ctx_dep)) -> AdminGameState:
    label = clean_label(body.label)
    targets = clean_targets(body.target_names)
    game = await repo.create_game("admin_link", label=label, mode=body.mode, target_names=targets)
    ctx.manager.request_dashboard()
    return await views.admin_state(ctx, game)


@protected.get("/links/{game_id}", response_model=AdminGameState)
async def get_link(game_id: str, ctx: AppContext = Depends(ctx_dep)) -> AdminGameState:
    return await views.admin_state(ctx, await load_link(game_id))


@protected.patch("/links/{game_id}", response_model=AdminGameState)
async def update_link(
    game_id: str, body: UpdateLinkRequest, ctx: AppContext = Depends(ctx_dep)
) -> AdminGameState:
    fields = body.model_fields_set
    if not fields & {"label", "mode", "target_names"}:
        raise validation_error("Provide at least one of label, mode or target_names")
    changes: dict = {}
    if "label" in fields:
        changes["label"] = clean_label(body.label)
    if "mode" in fields:
        if body.mode is None:
            raise validation_error("mode: Input should be 'fair', 'always' or 'never'")
        changes["mode"] = body.mode
    if "target_names" in fields:
        if body.target_names is None:
            raise validation_error("target_names: Input should be a valid list")
        changes["target_names"] = clean_targets(body.target_names)
    await load_link(game_id)
    async with ctx.runtime.locked(game_id):
        game = await repo.update_rules(game_id, **changes)
        if game is None:
            raise game_not_found()
        # Admin sockets + dashboard only. NOTHING goes to player sockets (§10.3).
        await views.notify_admin_change(ctx, game_id)
        return await views.admin_state(ctx, game)


@protected.delete("/links/{game_id}", status_code=204)
async def delete_link(game_id: str, ctx: AppContext = Depends(ctx_dep)) -> Response:
    await load_link(game_id)
    async with ctx.runtime.locked(game_id):
        await repo.delete_game(game_id)
        ctx.runtime.forget(game_id)
    await ctx.manager.send_players(game_id, ser.GAME_DELETED_EVENT)
    await ctx.manager.send_admins(game_id, ser.GAME_DELETED_EVENT)
    await ctx.manager.close_game(game_id, code=1000)
    ctx.manager.request_dashboard()
    return Response(status_code=204)
