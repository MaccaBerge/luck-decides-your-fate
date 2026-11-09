"""Row -> API model conversion.

SECRECY-CRITICAL: this module is the ONLY place where public JSON is built. Public builders
(`public_game_state`, `spin_started`, `spin_finished_event`, the player event helpers) take only
the data a friend may see and never receive a GameRow's rig fields (mode, target_names, label,
origin) or any rule information. Admin builders are kept separate and are only used for admin
REST responses and admin sockets.
"""
from __future__ import annotations

from typing import Any, Sequence

from app.db.rows import EntryRow, GameRow, JoinRequestRow, PlayerRow, RemovalRow, SpinRow
from app.engine.rigging import RuleStatus
from app.services.backup import BackupStatus
from app.models import (
    ControlOut,
    WheelLists,
    AdminGameState,
    AdminSpinRecord,
    BackupStatusOut,
    Dashboard,
    EntryOut,
    GameSettingsOut,
    LastResult,
    JoinRequestOut,
    LinkSummary,
    PlayerOut,
    PublicGameState,
    RemovedPlayerOut,
    RecentSpin,
    RuleStatusOut,
    RuleTarget,
    SpinStarted,
)


# ---------------------------------------------------------------- public
def entry_out(e: EntryRow) -> EntryOut:
    return EntryOut(id=e.id, name=e.name, color=e.color, position=e.position, is_active=e.is_active)


def public_game_state(
    game: GameRow,
    entries: Sequence[EntryRow],
    current_spin: SpinStarted | None,
    last_result: LastResult | None,
    recent_spins: Sequence[SpinRow],
    players: Sequence[PlayerRow] = (),
    here: set[str] | frozenset[str] = frozenset(),
    requests: Sequence[JoinRequestRow] = (),
    removed: Sequence[tuple[RemovalRow, bool]] = (),
) -> PublicGameState:
    # Only id, remove_winner, kind, join_code and join_policy are read from the game row. Nothing else
    # of `game` may be used here (never origin, label, mode or target_names).
    multiplayer = game.kind == "multiplayer"
    return PublicGameState(
        id=game.id,
        game_type="wheel",
        kind=game.kind,
        join_code=game.join_code if multiplayer else None,
        join_policy=game.join_policy if multiplayer else "open",
        join_requests=[
            JoinRequestOut(player_id=r.player_id, name=r.name, avatar=r.avatar, state=r.state)  # type: ignore[arg-type]
            for r in requests
            if r.state in ("pending", "accepted") and not r.invited  # invitations are listed as removed players
        ]
        if multiplayer
        else [],
        removed_players=[
            RemovedPlayerOut(player_id=r.player_id, name=r.name, avatar=r.avatar, reason=r.reason, invited=inv)  # type: ignore[arg-type]
            for r, inv in removed
        ]
        if multiplayer
        else [],
        players=[player_out(p, p.id in here) for p in players] if multiplayer else [],
        entries=[entry_out(e) for e in sorted(entries, key=lambda e: e.position)],
        settings=GameSettingsOut(remove_winner=game.remove_winner),
        current_spin=current_spin,
        last_result=last_result,
        recent_spins=[
            # Copies only these fields: a SpinRow also carries mode and rule_applied.
            RecentSpin(spin_id=s.id, winner_name=s.winner_name, finished_at=s.finished_at)
            for s in recent_spins
            if s.finished_at is not None
        ],
    )


def player_out(p: PlayerRow, is_here: bool) -> PlayerOut:
    # Never the token hash.
    return PlayerOut(
        id=p.id,
        entry_id=p.entry_id,
        name=p.name,
        avatar=p.avatar,
        status="here" if is_here else "away",
        is_host=p.is_host,
    )


def last_result_from_spin(spin: SpinRow) -> LastResult | None:
    if spin.finished_at is None:
        return None
    return LastResult(
        spin_id=spin.id,
        winner_entry_id=spin.winner_entry_id,
        winner_name=spin.winner_name,
        finished_at=spin.finished_at,
    )


def spin_started(
    spin: SpinRow,
    wheel_entry_ids: list[str],
    *,
    landing_offset: float,
    extra_rotations: int,
    duration_ms: int,
) -> SpinStarted:
    return SpinStarted(
        spin_id=spin.id,
        winner_entry_id=spin.winner_entry_id,
        winner_name=spin.winner_name,
        wheel_entry_ids=list(wheel_entry_ids),
        winner_index=wheel_entry_ids.index(spin.winner_entry_id),
        landing_offset=landing_offset,
        extra_rotations=extra_rotations,
        duration_ms=duration_ms,
        started_at=spin.started_at,
    )


def dump(model: Any) -> Any:
    return model.model_dump(mode="json")


# Player socket events -------------------------------------------------
def player_state_event(state: PublicGameState) -> dict[str, Any]:
    return {"type": "state", "state": dump(state)}


def player_spin_started_event(spin: SpinStarted) -> dict[str, Any]:
    return {"type": "spin_started", "spin": dump(spin)}


def spin_finished_event(result: LastResult) -> dict[str, Any]:
    # Identical for players and admins.
    return {
        "type": "spin_finished",
        "spin_id": result.spin_id,
        "winner_entry_id": result.winner_entry_id,
        "winner_name": result.winner_name,
    }


GAME_DELETED_EVENT: dict[str, Any] = {"type": "game_deleted"}


# ---------------------------------------------------------------- admin
def link_status(game: GameRow, player_count: int) -> str:
    if game.first_opened_at is None:
        return "created"
    if player_count > 0:
        return "connected"
    return "disconnected"


def link_summary(game: GameRow, *, player_count: int, entry_count: int, rule: Any = None) -> LinkSummary:
    """`rule`: the RuleSettings in effect (app.services.control), when not the game's own."""
    rule = rule or game
    return LinkSummary(
        id=game.id,
        path=f"/g/{game.id}",
        label=game.label,
        mode=rule.mode,
        target_names=list(rule.target_names),
        chance=rule.chance,
        max_streak=rule.max_streak,
        script=list(game.script),
        status=link_status(game, player_count),  # type: ignore[arg-type]
        player_count=player_count,
        entry_count=entry_count,
        created_at=game.created_at,
        first_opened_at=game.first_opened_at,
        last_activity_at=game.last_activity_at,
    )


def rule_status_out(status: RuleStatus) -> RuleStatusOut:
    return RuleStatusOut(
        state=status.state,
        matched_target=status.matched_target,
        matched_entry_ids=list(status.matched_entry_ids),
        targets=[RuleTarget(name=name, entry_ids=list(ids)) for name, ids in status.targets],
        script_step=(
            RuleTarget(name=status.script_step[0], entry_ids=list(status.script_step[1]))
            if status.script_step
            else None
        ),
        streak=status.streak,
        decider=status.decider,
    )


def admin_spin_record(spin: SpinRow) -> AdminSpinRecord:
    return AdminSpinRecord(
        spin_id=spin.id,
        winner_entry_id=spin.winner_entry_id,
        winner_name=spin.winner_name,
        mode=spin.mode,
        rule_applied=spin.rule_applied,
        started_at=spin.started_at,
        finished_at=spin.finished_at,
    )


def control_out(eff: Any) -> ControlOut:
    return ControlOut(source=eff.source, friends=list(eff.friends), matched=eff.matched)


def admin_game_state(
    public: PublicGameState,
    link: LinkSummary,
    control: ControlOut,
    rule: RuleStatus,
    spins: Sequence[SpinRow],
) -> AdminGameState:
    return AdminGameState(
        game=public,
        link=link,
        control=control,
        rule_status=rule_status_out(rule),
        spin_history=[admin_spin_record(s) for s in spins],
    )


def dashboard(live_games: int, links: list[LinkSummary], wheels: WheelLists, backup: BackupStatus) -> Dashboard:
    return Dashboard(
        live_games=live_games,
        links=links,
        wheels=wheels,
        backup=BackupStatusOut(
            enabled=backup.enabled,
            last_success_at=backup.last_success_at,
            last_error=backup.last_error,
        ),
    )


def admin_state_event(state: AdminGameState) -> dict[str, Any]:
    return {"type": "admin_state", "state": dump(state)}


def admin_spin_started_event(spin: SpinStarted, rule_applied: bool) -> dict[str, Any]:
    return {"type": "spin_started", "spin": dump(spin), "rule_applied": rule_applied}


def dashboard_event(d: Dashboard) -> dict[str, Any]:
    return {"type": "dashboard", "dashboard": dump(d)}
