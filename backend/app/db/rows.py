from dataclasses import dataclass
from typing import Literal

Mode = Literal["fair", "always", "never"]
Origin = Literal["public", "admin_link"]


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
