from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["fair", "always", "never"]
LinkStatus = Literal["created", "connected", "disconnected"]
RuleState = Literal["fair_mode", "active", "no_match", "all_excluded"]


# ---------- public ----------
class EntryOut(BaseModel):
    id: str
    name: str
    color: str
    position: int
    is_active: bool


class GameSettingsOut(BaseModel):
    remove_winner: bool


class SpinStarted(BaseModel):
    spin_id: int
    winner_entry_id: str
    winner_name: str
    wheel_entry_ids: list[str]     # active entry ids in wheel order at spin time
    winner_index: int              # index of winner in wheel_entry_ids
    landing_offset: float
    extra_rotations: int
    duration_ms: int
    started_at: str


class LastResult(BaseModel):
    spin_id: int
    winner_entry_id: str
    winner_name: str
    finished_at: str


class PublicGameState(BaseModel):
    id: str
    game_type: Literal["wheel"]
    entries: list[EntryOut]        # ordered by position, includes inactive
    settings: GameSettingsOut
    current_spin: SpinStarted | None
    last_result: LastResult | None


# ---------- public requests ----------
class AddEntriesRequest(BaseModel):
    names: list[str] = Field(min_length=1, max_length=100)
    # server: strip each; drop empty; 422 if none remain or any > 40 chars


class UpdateEntryRequest(BaseModel):
    name: str | None = None                                        # stripped, 1..40 chars
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    is_active: bool | None = None


class UpdateSettingsRequest(BaseModel):
    remove_winner: bool


# ---------- admin ----------
class LoginRequest(BaseModel):
    password: str


class LinkSummary(BaseModel):
    id: str
    path: str                      # "/g/{id}"
    label: str | None
    mode: Mode
    target_names: list[str]
    status: LinkStatus
    player_count: int
    entry_count: int               # active entries
    created_at: str
    first_opened_at: str | None
    last_activity_at: str


class RuleStatusOut(BaseModel):
    state: RuleState
    matched_target: str | None
    matched_entry_ids: list[str]


class AdminSpinRecord(BaseModel):
    spin_id: int
    winner_entry_id: str
    winner_name: str
    mode: Mode
    rule_applied: bool
    started_at: str
    finished_at: str | None


class AdminGameState(BaseModel):
    game: PublicGameState
    link: LinkSummary
    rule_status: RuleStatusOut
    spin_history: list[AdminSpinRecord]   # newest first, max 50


class BackupStatusOut(BaseModel):
    enabled: bool
    last_success_at: str | None
    last_error: str | None         # short and generic: never a URL or key


class Dashboard(BaseModel):
    live_games: int                # games of ANY origin with >= 1 player socket
    links: list[LinkSummary]       # admin links only, newest created first
    backup: BackupStatusOut


class CreateLinkRequest(BaseModel):
    label: str | None = Field(default=None, max_length=60)
    mode: Mode = "fair"
    target_names: list[str] = Field(default_factory=list, max_length=20)
    # server: strip each target; drop empty; each <= 40 chars


class UpdateLinkRequest(BaseModel):
    label: str | None = None
    mode: Mode | None = None
    target_names: list[str] | None = None
    # at least one field must be present, else 422


# ---------- errors ----------
class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
