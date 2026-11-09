"""Admin REST API (§8.2). Never calls mark_opened; rule changes never reach player sockets."""
from __future__ import annotations

import asyncio
from dataclasses import replace
import os

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.auth import COOKIE_NAME, SESSION_COOKIE_MAX_AGE, device_label, require_admin, session_token
from app.client_ip import get_client_ip
from app.context import AppContext, ctx_dep
from app.db import repository as repo
from app.db.rows import GameRow
from app.errors import game_not_found, invalid_password, session_not_found, too_many_attempts, validation_error
from app.analytics import counters
from app.analytics.report import build_report
from app.models import (
    AdminGameState,
    AdminSessionOut,
    AdminSessions,
    AllFairResult,
    FriendsIn,
    FriendsOut,
    StandingRule,
    UpdateStandingRequest,
    UpdateWheelRequest,
    ANALYTICS_DAYS,
    AnalyticsReport,
    CreateLinkRequest,
    Dashboard,
    LoginRequest,
    UpdateLinkRequest,
)
from app.services import serializers as ser
from app.services.backup import backup_filename, create_snapshot
from app.services import control, views
from app.engine.friends import MAX_ALIASES, MAX_FRIENDS, MAX_NAME_LEN
from app.timeutil import utc_iso

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


def clean_targets(targets: list[str], field: str = "target_names") -> list[str]:
    """Target names, or script steps: stripped, empty ones dropped, at most MAX_TARGETS."""
    if len(targets) > MAX_TARGETS:
        raise validation_error(f"{field}: At most {MAX_TARGETS} names")
    cleaned = [t.strip() for t in targets]
    cleaned = [t for t in cleaned if t]
    if any(len(t) > MAX_TARGET_LEN for t in cleaned):
        raise validation_error(f"{field}: Names can be at most {MAX_TARGET_LEN} characters")
    return cleaned


async def load_link(game_id: str) -> GameRow:
    game = await repo.get_game(game_id)
    if game is None or game.origin != "admin_link":
        raise game_not_found()
    return game


# ---------------------------------------------------------------- session
@router.post("/login")
async def login(
    body: LoginRequest, request: Request, response: Response, ctx: AppContext = Depends(ctx_dep)
) -> dict:
    ip = get_client_ip(request)
    retry_after = ctx.login_limiter.retry_after(ip)
    if retry_after is not None:
        raise too_many_attempts(retry_after)
    if not ctx.sessions.check_password(body.password):
        ctx.login_limiter.record_failure(ip)
        raise invalid_password()
    token = await ctx.sessions.create(device_label(request.headers.get("user-agent")))
    # The cookie lasts as long as a session can; the server ends it sooner after 60 days unused.
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_COOKIE_MAX_AGE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=ctx.settings.cookie_secure,
    )
    return {"ok": True}


@protected.post("/logout", status_code=204)
async def logout(request: Request, ctx: AppContext = Depends(ctx_dep)) -> Response:
    await ctx.sessions.revoke(session_token(request))
    response = Response(status_code=204)
    response.delete_cookie(
        COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=ctx.settings.cookie_secure
    )
    return response


@protected.get("/me")
async def me() -> dict:
    return {"authenticated": True}


@protected.get("/sessions", response_model=AdminSessions)
async def list_sessions(request: Request, ctx: AppContext = Depends(ctx_dep)) -> AdminSessions:
    """The devices logged in to the controller, most recently used first."""
    current = ctx.sessions.get(session_token(request))
    return AdminSessions(
        sessions=[
            AdminSessionOut(
                id=s.id,
                device=s.device,
                created_at=utc_iso(s.created_at),
                last_used_at=utc_iso(s.last_used_at),
                expires_at=utc_iso(s.expires_at()),
                current=current is not None and s.id == current.id,
            )
            for s in ctx.sessions.list()
        ]
    )


@protected.delete("/sessions/{session_id}", status_code=204)
async def sign_out_device(session_id: str, ctx: AppContext = Depends(ctx_dep)) -> Response:
    """Sign out one device (this one too, if it's this device's ID)."""
    if not await ctx.sessions.revoke_id(session_id):
        raise session_not_found()
    return Response(status_code=204)


@protected.post("/sessions/sign-out-others", status_code=204)
async def sign_out_others(request: Request, ctx: AppContext = Depends(ctx_dep)) -> Response:
    """Sign out every device except this one."""
    await ctx.sessions.revoke_others(session_token(request))
    return Response(status_code=204)


# ---------------------------------------------------------------- backup
@protected.get("/backup")
async def backup(ctx: AppContext = Depends(ctx_dep)) -> FileResponse:
    path = await asyncio.to_thread(create_snapshot, ctx.settings.database_path)
    return FileResponse(
        path,
        media_type="application/vnd.sqlite3",
        filename=backup_filename(),
        background=BackgroundTask(os.unlink, path),
    )


# ---------------------------------------------------------------- analytics
@protected.get("/analytics", response_model=AnalyticsReport)
async def analytics(days: int = 7, ctx: AppContext = Depends(ctx_dep)) -> AnalyticsReport:
    if days not in ANALYTICS_DAYS:
        raise validation_error("days: Input should be 7, 30 or 90")
    return await build_report(ctx, days)


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
    await counters.bump(counters.LINKS_CREATED)
    return await views.admin_state(ctx, game)


@protected.get("/links/{game_id}", response_model=AdminGameState)
async def get_link(game_id: str, ctx: AppContext = Depends(ctx_dep)) -> AdminGameState:
    return await views.admin_state(ctx, await load_link(game_id))


@protected.patch("/links/{game_id}", response_model=AdminGameState)
async def update_link(
    game_id: str, body: UpdateLinkRequest, ctx: AppContext = Depends(ctx_dep)
) -> AdminGameState:
    fields = body.model_fields_set
    if not fields & {"label", "mode", "target_names", "chance", "max_streak", "script"}:
        raise validation_error("Provide at least one of label, mode, target_names, chance, max_streak or script")
    changes = rule_changes(body)
    if "label" in fields:
        changes["label"] = clean_label(body.label)
    await load_link(game_id)
    async with ctx.runtime.locked(game_id):
        game = await repo.update_rules(game_id, **changes)
        if game is None:
            raise game_not_found()
        # Admin sockets + dashboard only. NOTHING goes to player sockets (§10.3).
        await views.notify_admin_change(ctx, game_id)
        return await views.admin_state(ctx, game)


RULE_FIELDS = {"mode", "target_names", "chance", "max_streak"}


def rule_changes(body) -> dict:
    """The rule fields (and script) present in an update body, validated and cleaned."""
    fields = body.model_fields_set
    changes: dict = {}
    if "mode" in fields:
        if body.mode is None:
            raise validation_error("mode: Input should be 'fair', 'always' or 'never'")
        changes["mode"] = body.mode
    if "target_names" in fields:
        if body.target_names is None:
            raise validation_error("target_names: Input should be a valid list")
        changes["target_names"] = clean_targets(body.target_names)
    # null clears these two: chance (every spin) and max_streak (off).
    if "chance" in fields:
        changes["chance"] = body.chance
    if "max_streak" in fields:
        changes["max_streak"] = body.max_streak
    if "script" in fields:
        if body.script is None:
            raise validation_error("script: Input should be a valid list")
        changes["script"] = clean_targets(body.script, field="script")
    return changes


@protected.post("/all-fair", response_model=AllFairResult)
async def all_fair(ctx: AppContext = Depends(ctx_dep)) -> AllFairResult:
    """The panic button: every link and wheel back to fair at once, scripts cleared, and the
    standing rule set to fair. Targets, chance and the streak breaker are kept, so anything can
    be rigged again with one change."""
    changed = await repo.all_games_fair()
    standing = await control.get_standing()
    if standing.mode != "fair":
        await control.set_standing(replace(standing, mode="fair"))
        await _standing_changed(ctx)
    for game_id in changed:
        await views.notify_admin_change(ctx, game_id)  # admins + dashboard only, never players
    return AllFairResult(changed=len(changed) + (standing.mode != "fair"))


# ---------------------------------------------------------------- ordinary wheels
async def load_wheel(game_id: str) -> GameRow:
    """An ordinary solo wheel (not a link; multiplayer games aren't controlled here yet)."""
    game = await repo.get_game(game_id)
    if game is None or game.origin != "public" or game.kind != "solo":
        raise game_not_found()
    return game


@protected.get("/wheels/{game_id}", response_model=AdminGameState)
async def get_wheel(game_id: str, ctx: AppContext = Depends(ctx_dep)) -> AdminGameState:
    return await views.admin_state(ctx, await load_wheel(game_id))


@protected.patch("/wheels/{game_id}", response_model=AdminGameState)
async def update_wheel(
    game_id: str, body: UpdateWheelRequest, ctx: AppContext = Depends(ctx_dep)
) -> AdminGameState:
    """Take control of an ordinary wheel. Changing its rule gives it its own rule, starting from
    the one in effect (the standing rule, or fair); `own_rule: false` hands it back to the
    standing rule. The script (next winners) is the wheel's own either way."""
    fields = body.model_fields_set
    if not fields & (RULE_FIELDS | {"script", "own_rule"}):
        raise validation_error("Provide at least one of mode, target_names, chance, max_streak, script or own_rule")
    if "own_rule" in fields and body.own_rule is not False:
        raise validation_error("own_rule: Only false (back to the standing rule) can be set")
    changes = rule_changes(body)
    await load_wheel(game_id)
    async with ctx.runtime.locked(game_id):
        game = await load_wheel(game_id)
        if body.own_rule is False:
            changes.update(own_rule=False, mode="fair", target_names=[], chance=None, max_streak=None)
        elif fields & RULE_FIELDS and not game.own_rule:
            active = [e for e in await repo.list_entries(game_id) if e.is_active]
            start = (await control.effective_rule(game, active)).settings
            changes = {"mode": start.mode, "target_names": start.target_names, "chance": start.chance,
                       "max_streak": start.max_streak, **changes, "own_rule": True}
        game = await repo.update_rules(game_id, **changes)
        if game is None:
            raise game_not_found()
        await views.notify_admin_change(ctx, game_id)  # admins + dashboard only, never players
        return await views.admin_state(ctx, game)


# ---------------------------------------------------------------- friends and the standing rule
async def _standing_changed(ctx: AppContext) -> None:
    """The friends list or standing rule changed: refresh the dashboard and any open wheel pages."""
    for game in await repo.list_solo_wheels():
        await views.notify_admins(ctx, game)
    ctx.manager.request_dashboard()


async def _friends_out() -> FriendsOut:
    s = await control.get_standing()
    return FriendsOut(
        friends=await control.get_friends(),
        standing=StandingRule(mode=s.mode, target_names=s.target_names, chance=s.chance, max_streak=s.max_streak),
    )


@protected.get("/friends", response_model=FriendsOut)
async def get_friends() -> FriendsOut:
    return await _friends_out()


@protected.put("/friends", response_model=FriendsOut)
async def put_friends(body: FriendsIn, ctx: AppContext = Depends(ctx_dep)) -> FriendsOut:
    """Replace the friends list: each friend is the names they go by, display name first."""
    friends = [[n.strip() for n in f if n.strip()] for f in body.friends]
    friends = [f for f in friends if f]
    if len(friends) > MAX_FRIENDS or any(len(f) > MAX_ALIASES for f in friends):
        raise validation_error(f"friends: At most {MAX_FRIENDS} friends with {MAX_ALIASES} names each")
    if any(len(n) > MAX_NAME_LEN for f in friends for n in f):
        raise validation_error(f"friends: Names can be at most {MAX_NAME_LEN} characters")
    await control.set_friends(friends)
    await _standing_changed(ctx)
    return await _friends_out()


@protected.patch("/standing-rule", response_model=FriendsOut)
async def update_standing(body: UpdateStandingRequest, ctx: AppContext = Depends(ctx_dep)) -> FriendsOut:
    """The rule for friends' wheels you haven't set yourself."""
    if not body.model_fields_set & RULE_FIELDS:
        raise validation_error("Provide at least one of mode, target_names, chance or max_streak")
    changes = rule_changes(body)
    await control.set_standing(replace(await control.get_standing(), **changes))
    await _standing_changed(ctx)
    return await _friends_out()


async def _end_game(ctx: AppContext, game_id: str) -> None:
    """Delete a game now, even mid-spin, and tell everyone on it that it was ended on purpose.
    A link and a wheel get exactly the same message."""
    async with ctx.runtime.locked(game_id):
        await repo.delete_game(game_id)
        ctx.runtime.forget(game_id)
    await ctx.manager.send_players(game_id, ser.GAME_ENDED_BY_OPERATOR_EVENT)
    await ctx.manager.send_admins(game_id, ser.GAME_ENDED_BY_OPERATOR_EVENT)
    await ctx.manager.close_game(game_id, code=1000)
    ctx.manager.request_dashboard()


@protected.delete("/links/{game_id}", status_code=204)
async def delete_link(game_id: str, ctx: AppContext = Depends(ctx_dep)) -> Response:
    await load_link(game_id)
    await _end_game(ctx, game_id)
    return Response(status_code=204)


@protected.delete("/wheels/{game_id}", status_code=204)
async def delete_wheel(game_id: str, ctx: AppContext = Depends(ctx_dep)) -> Response:
    """Delete an ordinary wheel, even one in use: anyone on it is told the developer ended it."""
    await load_wheel(game_id)
    await _end_game(ctx, game_id)
    return Response(status_code=204)
