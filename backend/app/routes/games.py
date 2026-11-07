"""Public REST API (§8.1). Responses are built only via app.services.serializers (no rig info)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse, Response

from app.analytics import counters
from app.context import AppContext, ctx_dep
from app.db import repository as repo
from app.db.connection import ping
from app.db.rows import GameRow
from app.errors import (
    already_multiplayer,
    code_not_found,
    entries_limit,
    entry_not_found,
    error_response,
    game_not_found,
    not_multiplayer,
    player_not_found,
    validation_error,
)
from app.db.ids import JOIN_CODE_LENGTH, new_player_token
from app.models import (
    AddEntriesRequest,
    JoinCodeLookup,
    JoinRequest,
    JoinResponse,
    PublicGameState,
    SocketTicket,
    SpinStarted,
    UpdateEntryRequest,
    UpdateSettingsRequest,
)
from app.services import players, spins, views

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

MAX_NAME_LEN = 40
MAX_ENTRIES = 100


def clean_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise validation_error("name: Name cannot be empty")
    if len(cleaned) > MAX_NAME_LEN:
        raise validation_error(f"name: Names can be at most {MAX_NAME_LEN} characters")
    return cleaned


def clean_names(names: list[str]) -> list[str]:
    cleaned = [n.strip() for n in names]
    cleaned = [n for n in cleaned if n]
    if not cleaned:
        raise validation_error("names: Add at least one name")
    if any(len(n) > MAX_NAME_LEN for n in cleaned):
        raise validation_error(f"names: Names can be at most {MAX_NAME_LEN} characters")
    return cleaned


# The key a multiplayer player's browser keeps, sent on every request. Solo wheels ignore it.
PlayerToken = Header(default=None, alias="X-Player-Token")


async def load_game(game_id: str) -> GameRow:
    game = await repo.get_game(game_id)
    if game is None:
        raise game_not_found()
    return game


async def _after_mutation(ctx: AppContext, game_id: str) -> PublicGameState:
    await repo.touch_game(game_id)
    await views.notify_public_change(ctx, game_id)
    return await views.public_state(ctx, await load_game(game_id))


@router.get("/health")
async def health() -> Response:
    try:
        await ping()
    except Exception:  # noqa: BLE001
        log.exception("health check: database unavailable")
        return error_response(503, "unhealthy", "Database unavailable")
    return JSONResponse({"status": "ok"})


@router.post("/games", status_code=201, response_model=PublicGameState)
async def create_game(ctx: AppContext = Depends(ctx_dep)) -> PublicGameState:
    game = await repo.create_game("public")
    ctx.manager.request_dashboard()
    await counters.bump(counters.WHEELS_CREATED)
    return await views.public_state(ctx, game, [])


@router.get("/games/{game_id}", response_model=PublicGameState)
async def get_game(game_id: str, ctx: AppContext = Depends(ctx_dep)) -> PublicGameState:
    game = await load_game(game_id)
    await repo.mark_opened(game_id)
    if game.first_opened_at is None:
        # Created -> opened: only admins can observe this.
        await views.notify_admin_change(ctx, game_id)
    return await views.public_state(ctx, await load_game(game_id))


@router.post("/games/{game_id}/entries", response_model=PublicGameState)
async def add_entries(
    game_id: str, body: AddEntriesRequest, ctx: AppContext = Depends(ctx_dep),
    token: str | None = PlayerToken,
) -> PublicGameState:
    names = clean_names(body.names)
    await players.require_control(await load_game(game_id), token)
    async with ctx.runtime.mutation(game_id):
        existing = await repo.list_entries(game_id)
        if len(existing) + len(names) > MAX_ENTRIES:
            raise entries_limit()
        await repo.add_entries(game_id, names)
        state = await _after_mutation(ctx, game_id)
    await counters.bump(counters.NAMES_ADDED, len(names))
    return state


@router.patch("/games/{game_id}/entries/{entry_id}", response_model=PublicGameState)
async def update_entry(
    game_id: str, entry_id: str, body: UpdateEntryRequest, ctx: AppContext = Depends(ctx_dep),
    token: str | None = PlayerToken,
) -> PublicGameState:
    changes: dict = {}
    if body.name is not None:
        changes["name"] = clean_name(body.name)
    if body.color is not None:
        changes["color"] = body.color.upper()
    if body.is_active is not None:
        changes["is_active"] = body.is_active
    if not changes:
        raise validation_error("Provide at least one of name, color or is_active")
    await players.require_control(await load_game(game_id), token)
    async with ctx.runtime.mutation(game_id):
        if await repo.update_entry(game_id, entry_id, **changes) is None:
            raise entry_not_found()
        return await _after_mutation(ctx, game_id)


@router.delete("/games/{game_id}/entries/{entry_id}", response_model=PublicGameState)
async def delete_entry(
    game_id: str, entry_id: str, ctx: AppContext = Depends(ctx_dep),
    token: str | None = PlayerToken,
) -> PublicGameState:
    await players.require_control(await load_game(game_id), token)
    async with ctx.runtime.mutation(game_id):
        player = await repo.player_for_entry(game_id, entry_id)
        if player is not None:
            # A player's name is the player: deleting it removes them from the game.
            await players.remove(ctx, game_id, player.id)
        elif not await repo.delete_entry(game_id, entry_id):
            raise entry_not_found()
        return await _after_mutation(ctx, game_id)


@router.post("/games/{game_id}/shuffle", response_model=PublicGameState)
async def shuffle(
    game_id: str, ctx: AppContext = Depends(ctx_dep), token: str | None = PlayerToken
) -> PublicGameState:
    await players.require_control(await load_game(game_id), token)
    async with ctx.runtime.mutation(game_id):
        await repo.shuffle_entries(game_id)
        return await _after_mutation(ctx, game_id)


@router.post("/games/{game_id}/restore", response_model=PublicGameState)
async def restore(
    game_id: str, ctx: AppContext = Depends(ctx_dep), token: str | None = PlayerToken
) -> PublicGameState:
    await players.require_control(await load_game(game_id), token)
    async with ctx.runtime.mutation(game_id):
        await repo.restore_entries(game_id)
        return await _after_mutation(ctx, game_id)


@router.patch("/games/{game_id}/settings", response_model=PublicGameState)
async def update_settings(
    game_id: str, body: UpdateSettingsRequest, ctx: AppContext = Depends(ctx_dep),
    token: str | None = PlayerToken,
) -> PublicGameState:
    await players.require_control(await load_game(game_id), token)
    async with ctx.runtime.mutation(game_id):
        await repo.update_settings(game_id, remove_winner=body.remove_winner)
        return await _after_mutation(ctx, game_id)


@router.post("/games/{game_id}/spin", status_code=202, response_model=SpinStarted)
async def spin(
    game_id: str, ctx: AppContext = Depends(ctx_dep), token: str | None = PlayerToken
) -> SpinStarted:
    await players.require_control(await load_game(game_id), token)
    return await spins.start_spin(ctx, game_id)


# ---------------------------------------------------------------- multiplayer
async def _join(ctx: AppContext, game_id: str, body: JoinRequest, *, host: bool) -> JoinResponse:
    name = clean_name(body.name)
    avatar = players.check_avatar(body.avatar)
    token = new_player_token()
    async with ctx.runtime.mutation(game_id):
        game = await load_game(game_id)
        if host and game.kind == "multiplayer":
            raise already_multiplayer()
        if not host and game.kind != "multiplayer":
            raise not_multiplayer()
        if len(await repo.list_entries(game_id)) + 1 > MAX_ENTRIES:
            raise entries_limit()
        if host:
            await repo.make_multiplayer(game_id)
        # Hosting makes you host; joining makes you host only if nobody is (an empty game).
        first = host or not any(p.is_host for p in await repo.list_players(game_id))
        player = await repo.add_player(
            game_id, name=name, avatar=avatar, is_host=first, token_hash=players.hash_token(token)
        )
        state = await _after_mutation(ctx, game_id)
    await counters.bump(counters.NAMES_ADDED)
    return JoinResponse(player_id=player.id, player_token=token, state=state)


@router.post("/games/{game_id}/host", status_code=201, response_model=JoinResponse)
async def host_game(
    game_id: str, body: JoinRequest, ctx: AppContext = Depends(ctx_dep),
    token: str | None = PlayerToken,
) -> JoinResponse:
    """Turn a solo wheel into a multiplayer game, with the caller as its host."""
    await players.require_control(await load_game(game_id), token)
    return await _join(ctx, game_id, body, host=True)


@router.post("/games/{game_id}/players", status_code=201, response_model=JoinResponse)
async def join_game(game_id: str, body: JoinRequest, ctx: AppContext = Depends(ctx_dep)) -> JoinResponse:
    return await _join(ctx, game_id, body, host=False)


@router.delete("/games/{game_id}/players/me", response_model=PublicGameState)
async def leave_game(
    game_id: str, ctx: AppContext = Depends(ctx_dep), token: str | None = PlayerToken
) -> PublicGameState:
    player = await players.require_player(await load_game(game_id), token)
    async with ctx.runtime.mutation(game_id):
        await players.remove(ctx, game_id, player.id)
        return await _after_mutation(ctx, game_id)


@router.delete("/games/{game_id}/players/{player_id}", response_model=PublicGameState)
async def remove_player(
    game_id: str, player_id: str, ctx: AppContext = Depends(ctx_dep),
    token: str | None = PlayerToken,
) -> PublicGameState:
    game = await load_game(game_id)
    if game.kind != "multiplayer":
        raise not_multiplayer()
    await players.require_control(game, token)
    async with ctx.runtime.mutation(game_id):
        if not await players.remove(ctx, game_id, player_id):
            raise player_not_found()
        return await _after_mutation(ctx, game_id)


@router.post("/games/{game_id}/socket-ticket", response_model=SocketTicket)
async def socket_ticket(
    game_id: str, ctx: AppContext = Depends(ctx_dep), token: str | None = PlayerToken
) -> SocketTicket:
    """A single-use ticket for /ws/games/{id}?ticket=..., so the player's key stays out of URLs."""
    player = await players.require_player(await load_game(game_id), token)
    return SocketTicket(ticket=ctx.tickets.issue(game_id, player.id))


@router.get("/join/{code}", response_model=JoinCodeLookup)
async def find_by_code(code: str) -> JoinCodeLookup:
    code = code.strip().upper()
    game_id = await repo.game_id_for_code(code) if len(code) == JOIN_CODE_LENGTH else None
    if game_id is None:
        raise code_not_found()
    return JoinCodeLookup(game_id=game_id)
