from dataclasses import dataclass
from typing import Literal

Mode = Literal["fair", "always", "never"]
Origin = Literal["public", "admin_link"]
Kind = Literal["solo", "multiplayer"]
JoinPolicy = Literal["open", "ask", "closed"]


@dataclass(frozen=True)
class GameRow:
    id: str
    game_type: str               # always "wheel" in v1
    origin: Origin
    label: str | None
    mode: Mode
    target_names: list[str]      # stored as JSON text in SQLite
    remove_winner: bool
    created_at: str
    first_opened_at: str | None
    last_activity_at: str
    kind: Kind = "solo"
    join_code: str | None = None
    join_policy: JoinPolicy = "open"


@dataclass(frozen=True)
class EntryRow:
    id: str
    game_id: str
    name: str
    color: str                   # "#RRGGBB"
    position: int
    is_active: bool
    created_at: str


@dataclass(frozen=True)
class SpinRow:
    id: int
    game_id: str
    winner_entry_id: str
    winner_name: str
    mode: Mode                   # mode at the time of the spin
    rule_applied: bool
    started_at: str
    finished_at: str | None


@dataclass(frozen=True)
class PlayerRow:
    id: str
    game_id: str
    entry_id: str
    name: str                    # the entry's name
    avatar: str
    is_host: bool
    joined_at: str
    last_seen_at: str


RemovalReason = Literal["kicked", "banned", "timed_out"]


@dataclass(frozen=True)
class RemovalRow:
    game_id: str
    player_id: str
    name: str
    avatar: str
    reason: RemovalReason
    removed_at: str


@dataclass(frozen=True)
class JoinRequestRow:
    game_id: str
    token_hash: str
    player_id: str
    name: str
    avatar: str
    state: Literal["pending", "accepted", "declined"]
    created_at: str
    invited: bool = False
