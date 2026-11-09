from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Mode = Literal["fair", "always", "never"]
LinkStatus = Literal["created", "connected", "disconnected"]
RuleState = Literal["fair_mode", "active", "no_match", "all_excluded", "streak_paused"]
Decider = Literal["script", "rule", "fair"]
JoinPolicy = Literal["open", "ask", "closed"]


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


class RecentSpin(BaseModel):
    spin_id: int
    winner_name: str
    finished_at: str


Kind = Literal["solo", "multiplayer"]
PlayerStatus = Literal["here", "away"]


class PlayerOut(BaseModel):
    id: str
    entry_id: str                  # the player's slice on the wheel
    name: str
    avatar: str                    # a key from app.services.players.AVATARS
    status: PlayerStatus           # "here": a socket of theirs is open; "away": none is
    is_host: bool


class JoinRequestOut(BaseModel):
    """Someone asking to join (a newcomer, or a removed player asking to come back). 'accepted':
    the host said yes and the player hasn't confirmed yet."""
    player_id: str
    name: str
    avatar: str
    state: Literal["pending", "accepted"]


class RemovedPlayerOut(BaseModel):
    """A kicked or banned player, for the host's "Removed players" list."""
    player_id: str
    name: str
    avatar: str
    reason: Literal["kicked", "banned"]
    invited: bool                  # the host has invited them back; waiting for their answer


class PublicGameState(BaseModel):
    id: str
    game_type: Literal["wheel"]
    kind: Kind
    join_code: str | None          # multiplayer only
    join_policy: JoinPolicy        # multiplayer: anyone ("open"), host accepts ("ask"), nobody ("closed")
    join_requests: list[JoinRequestOut]  # multiplayer only
    removed_players: list[RemovedPlayerOut]  # multiplayer only: kicked and banned, newest first
    entries: list[EntryOut]        # ordered by position, includes inactive
    settings: GameSettingsOut
    current_spin: SpinStarted | None
    last_result: LastResult | None
    recent_spins: list[RecentSpin]  # finished spins only, newest first
    players: list[PlayerOut]       # multiplayer only (empty for solo), in joining order


# ---------- public requests ----------
class AddEntriesRequest(BaseModel):
    names: list[str] = Field(min_length=1, max_length=100)
    # server: strip each; drop empty; 422 if none remain or any > 40 chars


class UpdateEntryRequest(BaseModel):
    name: str | None = None                                        # stripped, 1..40 chars
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    is_active: bool | None = None


class UpdateSettingsRequest(BaseModel):
    remove_winner: bool | None = None
    join_policy: JoinPolicy | None = None   # multiplayer, host only


class JoinRequest(BaseModel):
    """Body of POST /api/games/{id}/host and POST /api/games/{id}/players."""
    name: str                      # stripped, 1..40 chars
    avatar: str                    # a key from app.services.players.AVATARS


class JoinResponse(BaseModel):
    # True: the game needs the host's OK, so this is a request (keep the key; confirm once accepted).
    requested: bool = False
    player_id: str
    player_token: str              # shown once; the browser keeps it, the server stores a hash
    state: PublicGameState


class JoinCodeLookup(BaseModel):
    game_id: str
    players: int                   # players in the game now (0: nobody, so nothing to rejoin)


class LeaveResponse(BaseModel):
    """Leaving as the last player ends the game; `state` is then null (whatever happened to it)."""
    ended: bool
    state: PublicGameState | None


class MyStatus(BaseModel):
    """What this browser's key is in a game: a player, removed (and why), or nothing; and its
    request to join. `invited`: the accepted request is the host's invitation."""
    status: Literal["player", "kicked", "banned", "timed_out", "none"]
    request: Literal["pending", "accepted", "declined"] | None = None
    invited: bool = False


class RejoinResponse(BaseModel):
    """`rejoined`: back in the game. Otherwise `request` says the host has been asked."""
    rejoined: bool
    request: Literal["pending"] | None
    state: PublicGameState


class SocketTicket(BaseModel):
    ticket: str                    # single use, valid for 30 seconds


# ---------- admin ----------
class LoginRequest(BaseModel):
    password: str


class AdminSessionOut(BaseModel):
    """A device logged in to the controller (GET /api/admin/sessions)."""
    id: str
    device: str
    created_at: str
    last_used_at: str
    expires_at: str
    current: bool  # the session making this request


class AdminSessions(BaseModel):
    sessions: list[AdminSessionOut]


class LinkSummary(BaseModel):
    id: str
    path: str                      # "/g/{id}"
    label: str | None
    mode: Mode
    target_names: list[str]
    chance: int | None             # "always": X wins this % of spins (null: every spin)
    max_streak: int | None         # streak breaker (null: off)
    script: list[str]              # upcoming winners, first one next
    status: LinkStatus
    player_count: int
    entry_count: int               # active entries
    created_at: str
    first_opened_at: str | None
    last_activity_at: str


class RuleTarget(BaseModel):
    name: str              # the target exactly as stored in target_names
    entry_ids: list[str]   # active entries it matches, possibly none


class RuleStatusOut(BaseModel):
    state: RuleState
    matched_target: str | None
    matched_entry_ids: list[str]
    targets: list[RuleTarget]   # every target in priority order
    # The script's next step and the active entries it matches (none: it waits for that name).
    script_step: RuleTarget | None
    streak: int                 # spins in a row the "always" target has won
    decider: Decider            # what decides the next spin


class AdminSpinRecord(BaseModel):
    spin_id: int
    winner_entry_id: str
    winner_name: str
    mode: Mode
    rule_applied: bool
    started_at: str
    finished_at: str | None


class ControlOut(BaseModel):
    """Which rule decides this game (see app.services.control)."""
    source: Literal["link", "own", "standing", "none"]
    friends: list[str]             # the friends on the wheel; [] for links
    matched: bool                  # at least two different friends: a friends' wheel


class WheelSummary(BaseModel):
    """An ordinary solo wheel in the controller's lists."""
    id: str
    path: str
    names: list[str]               # active names, in wheel order
    entry_count: int
    open_now: bool                 # someone has it open
    created_at: str
    last_activity_at: str
    control: ControlOut
    mode: Mode                     # the rule in effect (own or standing)
    chance: int | None
    script: list[str]


class WheelLists(BaseModel):
    matched: list[WheelSummary]    # friends' wheels
    others: list[WheelSummary]


class AdminGameState(BaseModel):
    game: PublicGameState
    # For an ordinary wheel: label null, and mode/targets/chance/max_streak are the rule in effect.
    link: LinkSummary
    control: ControlOut
    rule_status: RuleStatusOut
    spin_history: list[AdminSpinRecord]   # newest first, max 50


class BackupStatusOut(BaseModel):
    enabled: bool
    last_success_at: str | None
    last_error: str | None         # short and generic: never a URL or key


class Dashboard(BaseModel):
    live_games: int                # games of ANY origin with >= 1 player socket
    links: list[LinkSummary]       # admin links only, newest created first
    wheels: WheelLists             # ordinary solo wheels, most recently used first
    backup: BackupStatusOut


class UpdateWheelRequest(BaseModel):
    mode: Mode | None = None
    target_names: list[str] | None = None
    chance: int | None = Field(default=None, ge=1, le=100)
    max_streak: int | None = Field(default=None, ge=1, le=20)
    script: list[str] | None = None
    own_rule: bool | None = None   # only false: back to the standing rule


class StandingRule(BaseModel):
    mode: Mode
    target_names: list[str]
    chance: int | None
    max_streak: int | None


class UpdateStandingRequest(BaseModel):
    mode: Mode | None = None
    target_names: list[str] | None = None
    chance: int | None = Field(default=None, ge=1, le=100)
    max_streak: int | None = Field(default=None, ge=1, le=20)


class FriendsIn(BaseModel):
    friends: list[list[str]] = Field(max_length=200)


class FriendsOut(BaseModel):
    friends: list[list[str]]       # each friend: the names they go by, display name first
    standing: StandingRule


class AllFairResult(BaseModel):
    changed: int                   # links that were rigged (or had a script) and are fair now


class CreateLinkRequest(BaseModel):
    label: str | None = Field(default=None, max_length=60)
    mode: Mode = "fair"
    target_names: list[str] = Field(default_factory=list, max_length=20)
    # server: strip each target; drop empty; each <= 40 chars


class UpdateLinkRequest(BaseModel):
    label: str | None = None
    mode: Mode | None = None
    target_names: list[str] | None = None
    chance: int | None = Field(default=None, ge=1, le=100)      # null: every spin
    max_streak: int | None = Field(default=None, ge=1, le=20)   # null: off
    script: list[str] | None = None
    # at least one field must be present, else 422


# ---------- admin analytics (see docs/analytics.md) ----------
MetricKind = Literal["number", "series", "breakdown", "table"]
AnalyticsDays = Literal[7, 30, 90]
ANALYTICS_DAYS: tuple[int, ...] = (7, 30, 90)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class NumberData(_Strict):
    value: int | float
    hint: str | None = None
    # "duration": `value` is seconds, shown as e.g. "3m 20s".
    format: Literal["duration"] | None = None


class SeriesPoint(_Strict):
    day: str                       # YYYY-MM-DD, UTC
    value: int


class SeriesData(_Strict):
    points: list[SeriesPoint]      # one per day in the range, oldest first, zeros included
    hint: str | None = None


class BreakdownItem(_Strict):
    label: str
    value: int


class BreakdownData(_Strict):
    items: list[BreakdownItem]


class TableData(_Strict):
    columns: list[str]
    rows: list[list[str | int]]


MetricData = NumberData | SeriesData | BreakdownData | TableData


class AnalyticsMetric(BaseModel):
    id: str
    title: str
    description: str
    kind: MetricKind
    data: MetricData | None = None
    error: str | None = None       # exception class name only; set instead of data


class AnalyticsSection(BaseModel):
    id: str
    title: str
    metrics: list[AnalyticsMetric]


class AnalyticsReport(BaseModel):
    generated_at: str
    days: AnalyticsDays
    sections: list[AnalyticsSection]


# ---------- errors ----------
class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody
