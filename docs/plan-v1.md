# Rigged Wheel — Spin-the-Wheel Site with a Secret Live Controller

Build a "spin the wheel" website that looks and behaves exactly like an ordinary random name picker, plus a hidden admin controller (`/admin`) that can rig any game created from an admin link — before the friend opens it, and live while they play — from a separate device.

This is a prank tool for friends and a learning project. v1 contains **one game (the wheel)** and **three modes (fair / always X / never X)**, but the architecture must make adding more games and rule types later straightforward.

---

## 1. Core Concepts (read first)

### 1.1 Outcome first, animation second
Every spin works the same way, fair or rigged:
1. A client asks the server to spin (`POST /api/games/{id}/spin`).
2. The **server** picks the winner (randomly in fair mode, or by applying the game's rule).
3. The server broadcasts the winner plus random animation parameters to every client watching that game.
4. Each client animates the wheel so it lands on that winner.

Rigging exists **only on the server**. The browser code path, network payloads, and animation are byte-for-byte the same shape in fair and rigged games. A friend opening dev tools must find nothing.

### 1.2 Games, links, and players
- A **game** = one wheel with its entries (names), settings, and spin history. URL: `/g/{gameId}`.
- **Public games**: anyone visiting `/` gets a fresh fair game. Cannot be rigged in v1.
- **Admin links**: the admin creates a game from the controller. It gets the *same kind of URL* (`/g/{gameId}`, same ID format). The admin can set and change its rules at any time.
- **Shared wheel**: everyone who opens the same `/g/{gameId}` sees the same live wheel (names, spins, results are synced in real time).
- **Players** = browser tabs connected to a game's player WebSocket. **Admin sockets never count as players.**

### 1.3 The rule (one per admin link)
| Field | Meaning |
|---|---|
| `mode` | `"fair"` \| `"always"` \| `"never"` |
| `target_names` | Ordered priority list typed by the admin, e.g. `["Jonas", "Jonny", "J"]` |

**Resolving X (the target):** walk `target_names` in order; the **first** name whose normalized form equals the normalized form of at least one *active* wheel entry becomes X. All active entries matching that normalized name (duplicates) count as X. Later list names are ignored once one matches.

- `always`: winner is chosen uniformly among the entries that are X.
- `never`: winner is chosen uniformly among active entries that are **not** X.
- **Fallbacks → fair:** no target name matches any active entry; or `never` mode where every active entry is X.
- Rules are read **at the moment a spin starts**. Changing rules during an animation does not affect that spin.

### 1.4 Name normalization (exact match after normalizing)
```
normalize(name) = keep only characters where ch.isalnum() is True, then .casefold()
```
| Input | Normalized |
|---|---|
| `"JONAS"` | `jonas` |
| `"  Jo nas "` | `jonas` |
| `"Jonas!"` | `jonas` |
| `"Jonas B."` | `jonasb` (does NOT match `jonas`) |
| `"Bjørn"` | `bjørn` (does NOT match `bjorn`) |
| `"José"` | `josé` |
| `"!!!"` | `""` (empty → never matches; skipped as a target) |

### 1.5 Interaction with "remove winner"
- `always X` + remove winner: X wins, is removed, later spins are fair (X no longer on the wheel).
- `never X` + remove winner: X is never picked → **X is guaranteed to be the last one standing.**

---

## 2. Decisions Log (from the product owner)

| Topic | Decision |
|---|---|
| Scope v1 | Only the wheel game. Architecture must allow more games later (Plinko, slots, races…). |
| Modes v1 | fair, always X, never X. No weighted / Nth-spin / near-miss yet. |
| Rig location | Server-side only. No visual or network difference between fair and rigged. |
| Target selection | Admin types an ordered list of names; first one present on the wheel = X. |
| Matching | Exact match after normalization (§1.4). |
| Controller | Separate device, `/admin`, single password. Create links, see live status, change rules before and during play. |
| Link status | Created (never opened) / Connected (friend on page now) / Disconnected (opened before, nobody on it now). |
| Live view | Admin sees the friend's names, spins and results live. |
| Shared links | Option (a): everyone on the same link shares one synced wheel. |
| Dashboard | Live-games counter, list of links (private label, status, mode), open a link's control screen, delete links. |
| Public visitors | `/` → new fair game with its own shareable URL. Counted in live counter. Not riggable in v1 ("god mode" later). |
| Accounts | None for users. One admin password. |
| Friend wheel features v1 | Add/remove/edit names, paste list, spin + result popup, remove-winner option, shuffle, slice colors, sound, confetti, light/dark mode. |
| Cleanup | Public games auto-deleted after 7 days without activity. |
| Stack | Option B: Python FastAPI backend, React + TypeScript frontend. |
| Hosting | Local first, deployment-ready (single service, Dockerfile). Actual deployment out of scope. |

### Assumptions (made by the planner — confirm or change)
1. `Bjørn` ≠ `Bjorn` (no accent folding).
2. **Admin links are never auto-deleted**; only public games expire after 7 days. Admin deletes links manually.
3. A spin needs **≥ 2 active entries**. With 1 left, the UI shows "{name} is the last one standing".
4. Limits: name ≤ 40 chars, ≤ 100 entries per game, label ≤ 60 chars, ≤ 20 target names.
5. Sound and theme are per-device preferences (localStorage), not synced.
6. The admin cannot edit the friend's names in v1 (read-only live view + rule control).
7. Admin login sessions are kept in server memory; a server restart logs the admin out.
8. Single server process (`--workers 1`); live state (connections, spin locks) is in memory.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`), react-router-dom, lucide-react, canvas-confetti, Vitest |
| Backend | Python 3.11+, FastAPI, Uvicorn, native FastAPI WebSockets |
| Database | SQLite via aiosqlite |
| Config | python-dotenv + environment variables |
| Testing | pytest, pytest-asyncio, httpx, websockets (backend); Vitest (frontend); Vercel `agent-browser` CLI (E2E) |

**Communication model (important):**
- **All mutations go through REST** (easy to test with curl).
- **All live updates are pushed over WebSockets, server → client only.** Clients never send messages on sockets (the server ignores anything received).
- Clients render from server state: they may apply the state returned by a REST call immediately, and every WebSocket `state` event overwrites local state.

**Dev setup:** Vite dev server on `:5173` proxies `/api` and `/ws` to FastAPI on `:8000` (same origin from the browser → cookies and WebSockets just work).
**Production:** `npm run build` → `frontend/dist`; FastAPI serves it (single service, single URL).

---

## 4. Project Structure & Ownership

```
rigged-wheel/
├── README.md                         [server]
├── Dockerfile                        [server]
├── .gitignore                        [server]
├── backend/
│   ├── requirements.txt              [server]  (content fixed in §13)
│   ├── requirements-dev.txt          [server]  (content fixed in §13)
│   ├── pytest.ini                    [core]
│   ├── .env.example                  [server]
│   ├── app/
│   │   ├── __init__.py               [core]
│   │   ├── models.py                 [core]    Pydantic API schemas (§7)
│   │   ├── timeutil.py               [core]    utc_now_iso()
│   │   ├── db/
│   │   │   ├── __init__.py           [core]
│   │   │   ├── schema.sql            [core]
│   │   │   ├── connection.py         [core]
│   │   │   ├── rows.py               [core]    GameRow / EntryRow / SpinRow
│   │   │   ├── ids.py                [core]
│   │   │   └── repository.py         [core]
│   │   ├── engine/
│   │   │   ├── __init__.py           [core]
│   │   │   ├── names.py              [core]    normalize_name
│   │   │   ├── rigging.py            [core]    evaluate_rule, pick_winner
│   │   │   └── spin_params.py        [core]    generate_spin_params
│   │   ├── config.py                 [server]
│   │   ├── main.py                   [server]
│   │   ├── auth.py                   [server]
│   │   ├── errors.py                 [server]
│   │   ├── realtime/
│   │   │   ├── __init__.py           [server]
│   │   │   └── manager.py            [server]  connection registry + broadcasts
│   │   ├── services/
│   │   │   ├── __init__.py           [server]
│   │   │   ├── serializers.py        [server]  Row → API model (secrecy-critical)
│   │   │   ├── spins.py              [server]  spin lifecycle + locks
│   │   │   └── cleanup.py            [server]  hourly expiry task
│   │   └── routes/
│   │       ├── __init__.py           [server]
│   │       ├── games.py              [server]  public REST
│   │       ├── admin.py              [server]  admin REST
│   │       ├── ws.py                 [server]  all WebSocket endpoints
│   │       └── static.py             [server]  serve frontend/dist + SPA fallback
│   ├── scripts/
│   │   ├── smoke_api.sh              [server]  (content fixed in §12.2)
│   │   └── smoke_realtime.py         [server]  (content fixed in §12.2)
│   └── tests/
│       ├── core/                     [core]
│       └── server/                   [server]
└── frontend/
    ├── package.json, vite.config.ts, tsconfig*.json, index.html   [wheel]
    ├── src/
    │   ├── main.tsx, App.tsx, index.css                           [wheel]
    │   ├── lib/types.ts, api.ts, ws.ts, theme.ts, sound.ts         [wheel]
    │   ├── pages/HomePage.tsx, GamePage.tsx, NotFoundPage.tsx      [wheel]
    │   ├── components/wheel/Wheel.tsx, wheelMath.ts, wheelMath.test.ts   [wheel]
    │   ├── components/game/…  (EntryPanel, PasteNamesDialog, ResultDialog, GameToolbar, …)  [wheel]
    │   └── admin/                                                  [admin]
    │       ├── AdminApp.tsx        (default export, lazy-loaded)
    │       ├── adminApi.ts, adminTypes.ts, useAdminSocket.ts
    │       ├── LoginPage.tsx, DashboardPage.tsx, LinkControlPage.tsx
    │       └── components/…
```

---

## 5. Agent Team

Recommended: **4 agents + lead.** All four spawn **in parallel**. The contracts in §6–§9 are complete; every agent builds against them from minute one. Any deviation must be requested from the lead, who approves it, updates the contract, and notifies affected agents.

| Agent | Owns | Does NOT touch | Builds |
|---|---|---|---|
| **core** | `backend/app/db/**`, `backend/app/engine/**`, `backend/app/models.py`, `backend/app/timeutil.py`, `backend/app/__init__.py`, `backend/pytest.ini`, `backend/tests/core/**` | everything else | SQLite schema, repository, ID generation, colors, name normalization, rigging engine, spin parameter generator, Pydantic API models |
| **server** | everything else under `backend/` (incl. `scripts/`, `tests/server/`, `config.py`, `main.py`, `auth.py`, `errors.py`, `realtime/`, `services/`, `routes/`), root `README.md`, `Dockerfile`, `.gitignore` | `backend/app/db/**`, `backend/app/engine/**`, `models.py`, `frontend/**` | FastAPI app, REST routes, WebSockets, presence, spin lifecycle, admin auth, error envelope, static serving, cleanup task |
| **wheel** | all of `frontend/` **except** `frontend/src/admin/**` | `frontend/src/admin/**`, `backend/**` | Vite/Tailwind setup, routing, API + WS clients, `Wheel` component & math, game page with all friend features |
| **admin** | `frontend/src/admin/**` | everything else (must ask lead → wheel for new npm deps or changes to `src/lib`/`Wheel`) | Login, dashboard, link creation, live link control screen |

**Startup coordination (first minutes):**
- **admin** immediately creates a stub `src/admin/AdminApp.tsx` (`export default function AdminApp() { return null }`) so the wheel agent's build compiles.
- **core** creates `app/models.py` and `app/db/rows.py` **first** (copy from §7 / §6.1) so the server agent can import them early, then implements the logic.
- **server** may stub repository/engine calls while core finishes, but final code must call the real §6 functions.

---

## 6. Contract: core → server (Python interfaces)

All functions below are `async` unless marked sync. All timestamps are ISO-8601 UTC strings with milliseconds and `Z`, e.g. `"2026-11-03T18:22:05.123Z"`, produced by `app.timeutil.utc_now_iso()`.

### 6.1 Rows — `app/db/rows.py`
```python
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
```

### 6.2 Schema — `app/db/schema.sql`
```sql
CREATE TABLE IF NOT EXISTS games (
    id               TEXT PRIMARY KEY,
    game_type        TEXT NOT NULL DEFAULT 'wheel',
    origin           TEXT NOT NULL CHECK (origin IN ('public','admin_link')),
    label            TEXT,
    mode             TEXT NOT NULL DEFAULT 'fair' CHECK (mode IN ('fair','always','never')),
    target_names     TEXT NOT NULL DEFAULT '[]',
    remove_winner    INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    first_opened_at  TEXT,
    last_activity_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_origin_activity ON games(origin, last_activity_at);

CREATE TABLE IF NOT EXISTS entries (
    id         TEXT PRIMARY KEY,
    game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    position   INTEGER NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_game ON entries(game_id, position);

CREATE TABLE IF NOT EXISTS spins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    winner_entry_id TEXT NOT NULL,          -- no FK: entry may be deleted later
    winner_name     TEXT NOT NULL,          -- snapshot
    mode            TEXT NOT NULL,
    rule_applied    INTEGER NOT NULL,
    started_at      TEXT NOT NULL,
    finished_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_spins_game ON spins(game_id, id);
```
`PRAGMA foreign_keys = ON` must be executed on **every** connection.

### 6.3 IDs and colors — `app/db/ids.py`
```python
def new_game_id() -> str     # sync. 8 chars from [a-z0-9] via secrets.choice, e.g. "k3f9x2ab"
def new_entry_id() -> str    # sync. "en_" + 10 chars from [a-z0-9]
PALETTE: list[str] = [
    "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#22C55E", "#14B8A6",
    "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#D946EF", "#EC4899",
]
```
Public games and admin links use the **same** `new_game_id()`.

### 6.4 Connection — `app/db/connection.py`
```python
async def init_db(db_path: str) -> None
    # creates parent dir, runs schema.sql, stores db_path for repository use
```

### 6.5 Repository — `app/db/repository.py`
`UNSET` is a module-level sentinel meaning "don't change this field".
```python
UNSET: object

async def create_game(origin: Origin, *, label: str | None = None,
                      mode: Mode = "fair", target_names: list[str] | None = None) -> GameRow
async def get_game(game_id: str) -> GameRow | None
async def delete_game(game_id: str) -> bool                       # cascades entries + spins
async def touch_game(game_id: str) -> None                        # last_activity_at = now
async def mark_opened(game_id: str) -> None                       # sets first_opened_at only if NULL; also touches
async def list_admin_links() -> list[GameRow]                     # origin='admin_link', newest created first
async def update_rules(game_id: str, *, label=UNSET, mode=UNSET,
                       target_names=UNSET) -> GameRow | None
async def update_settings(game_id: str, *, remove_winner: bool) -> GameRow | None

async def list_entries(game_id: str) -> list[EntryRow]            # ordered by position ASC (active + inactive)
async def add_entries(game_id: str, names: list[str]) -> list[EntryRow]
    # appends at max(position)+1…; color = PALETTE[position % 12]; returns ALL entries of the game
async def update_entry(game_id: str, entry_id: str, *, name=UNSET, color=UNSET,
                       is_active=UNSET) -> EntryRow | None        # None if entry not in game
async def delete_entry(game_id: str, entry_id: str) -> bool
async def shuffle_entries(game_id: str) -> list[EntryRow]         # random permutation of positions (secrets.SystemRandom)
async def restore_entries(game_id: str) -> list[EntryRow]         # all is_active = True

async def record_spin(game_id: str, *, winner_entry_id: str, winner_name: str,
                      mode: Mode, rule_applied: bool) -> SpinRow   # finished_at NULL
async def finish_spin(spin_id: int) -> SpinRow
async def list_spins(game_id: str, limit: int = 50) -> list[SpinRow]   # newest first
async def get_last_finished_spin(game_id: str) -> SpinRow | None
async def finish_dangling_spins() -> int                           # startup: set finished_at on spins with NULL
async def delete_inactive_public_games(older_than_days: int) -> list[str]
    # deletes origin='public' games with last_activity_at older than N days; returns deleted ids
    # NEVER deletes admin links
```
The repository does not enforce business limits (entry count, name length); the server does.

### 6.6 Engine — `app/engine/`
```python
# names.py
def normalize_name(name: str) -> str        # sync; §1.4

# rigging.py
from dataclasses import dataclass
from typing import Literal, Sequence
import random

RuleState = Literal["fair_mode", "active", "no_match", "all_excluded"]

@dataclass(frozen=True)
class RuleStatus:
    state: RuleState
    matched_target: str | None        # the target string exactly as the admin typed it
    matched_entry_ids: list[str]      # active entries that are X

def evaluate_rule(active_entries: Sequence[EntryRow], mode: Mode,
                  target_names: Sequence[str]) -> RuleStatus      # sync
    # mode == "fair"                      -> state "fair_mode", matched_* still computed for display
    # no target matches                    -> "no_match"
    # mode == "never" and all active are X -> "all_excluded"
    # otherwise                            -> "active"

@dataclass(frozen=True)
class PickResult:
    winner: EntryRow
    rule_applied: bool                # True only when state == "active"

def pick_winner(active_entries: Sequence[EntryRow], mode: Mode,
                target_names: Sequence[str], rng: random.Random) -> PickResult   # sync
    # raises ValueError if active_entries is empty
    # state != "active" -> uniform over all active entries
    # always            -> uniform over X entries
    # never             -> uniform over non-X entries

# spin_params.py
@dataclass(frozen=True)
class SpinParams:
    landing_offset: float     # uniform in [0.08, 0.92] — position inside the winning slice
    extra_rotations: int      # uniform int in [5, 8]
    duration_ms: int          # uniform int in [min_ms, max_ms]

def generate_spin_params(rng: random.Random, min_ms: int = 4500, max_ms: int = 7000) -> SpinParams   # sync
```
The server passes `secrets.SystemRandom()` as `rng`. The parameter distributions are identical for fair and rigged spins.

---

## 7. Contract: Pydantic API models — `app/models.py` (core produces, server consumes)

These define the exact JSON. Field names are final.

```python
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

class Dashboard(BaseModel):
    live_games: int                # games of ANY origin with >= 1 player socket
    links: list[LinkSummary]       # admin links only, newest created first

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
```

`LinkSummary.status` rule: `"created"` if `first_opened_at` is null; `"connected"` if `player_count > 0`; otherwise `"disconnected"`.

---

## 8. Contract: REST API (server produces, wheel + admin consume)

**URL convention: NO trailing slashes anywhere.** FastAPI is created with `redirect_slashes=False`, so `/api/games/abc/` returns **404**, which makes mismatches fail loudly.

**Error envelope for every non-2xx response (including 422):**
```json
{"error": {"code": "game_not_found", "message": "Game not found"}}
```

| Code | HTTP | When |
|---|---|---|
| `game_not_found` | 404 | unknown game id (or public id on admin link routes) |
| `entry_not_found` | 404 | entry id not in this game |
| `validation_error` | 422 | body validation fails (message = first error, human readable) |
| `spin_in_progress` | 409 | spin, or any entry/shuffle/restore/settings mutation, while a spin is running |
| `not_enough_entries` | 409 | spin with < 2 active entries |
| `entries_limit` | 409 | adding would exceed 100 entries |
| `unauthorized` | 401 | admin route without valid session |
| `invalid_password` | 401 | wrong login password |

### 8.1 Public endpoints

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/api/health` | — | 200 `{"status": "ok"}` |
| POST | `/api/games` | — | **201** `PublicGameState` (new public, fair, no entries) |
| GET | `/api/games/{game_id}` | — | 200 `PublicGameState` — also calls `mark_opened` |
| POST | `/api/games/{game_id}/entries` | `AddEntriesRequest` | 200 `PublicGameState` |
| PATCH | `/api/games/{game_id}/entries/{entry_id}` | `UpdateEntryRequest` | 200 `PublicGameState` |
| DELETE | `/api/games/{game_id}/entries/{entry_id}` | — | 200 `PublicGameState` |
| POST | `/api/games/{game_id}/shuffle` | — | 200 `PublicGameState` |
| POST | `/api/games/{game_id}/restore` | — | 200 `PublicGameState` |
| PATCH | `/api/games/{game_id}/settings` | `UpdateSettingsRequest` | 200 `PublicGameState` |
| POST | `/api/games/{game_id}/spin` | — | **202** `SpinStarted` |

Every successful public mutation: updates `last_activity_at`, broadcasts `state` to that game's players, `admin_state` to that game's admin sockets, and a `dashboard` update.

Example `PublicGameState`:
```json
{
  "id": "k3f9x2ab",
  "game_type": "wheel",
  "entries": [
    {"id": "en_a1b2c3d4e5", "name": "Anna",  "color": "#EF4444", "position": 0, "is_active": true},
    {"id": "en_f6g7h8i9j0", "name": "Jonas", "color": "#F97316", "position": 1, "is_active": true}
  ],
  "settings": {"remove_winner": false},
  "current_spin": null,
  "last_result": {"spin_id": 3, "winner_entry_id": "en_f6g7h8i9j0", "winner_name": "Jonas", "finished_at": "2026-11-03T18:22:05.123Z"}
}
```

Example `SpinStarted`:
```json
{
  "spin_id": 4,
  "winner_entry_id": "en_f6g7h8i9j0",
  "winner_name": "Jonas",
  "wheel_entry_ids": ["en_a1b2c3d4e5", "en_f6g7h8i9j0"],
  "winner_index": 1,
  "landing_offset": 0.37,
  "extra_rotations": 6,
  "duration_ms": 5400,
  "started_at": "2026-11-03T18:23:00.001Z"
}
```

### 8.2 Admin endpoints (session cookie required except login)

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/admin/login` | `LoginRequest` | 200 `{"ok": true}` + `Set-Cookie: admin_session=…` |
| POST | `/api/admin/logout` | — | **204** (token invalidated server-side, cookie cleared) |
| GET | `/api/admin/me` | — | 200 `{"authenticated": true}` or 401 |
| GET | `/api/admin/dashboard` | — | 200 `Dashboard` |
| POST | `/api/admin/links` | `CreateLinkRequest` | **201** `AdminGameState` |
| GET | `/api/admin/links/{game_id}` | — | 200 `AdminGameState` (404 for public games) |
| PATCH | `/api/admin/links/{game_id}` | `UpdateLinkRequest` | 200 `AdminGameState` |
| DELETE | `/api/admin/links/{game_id}` | — | **204** |

- Admin endpoints **never** call `mark_opened` (the admin viewing a link must not flip it to "opened").
- `PATCH /api/admin/links/{id}` broadcasts **only** to admin sockets + dashboard. It must **never** send anything to player sockets (see §10).
- `DELETE` sends `{"type": "game_deleted"}` to player sockets of that game, then closes them (code 1000).

**Auth details:** login compares with `secrets.compare_digest` against `ADMIN_PASSWORD`. On success the server creates `secrets.token_urlsafe(32)`, stores it in an in-memory dict with a 30-day expiry, and sets cookie `admin_session` with `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` only when `COOKIE_SECURE=true`.

---

## 9. Contract: WebSockets (server produces, wheel + admin consume)

All messages are JSON objects with a `type` field. Server → client only. Clients build URLs from `window.location`:
```ts
const wsUrl = (path: string) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;
```

**Connection rule:** for rejected connections, the server **accepts, then immediately closes** with the code below (so browsers and test clients see a clean close code).

| Path | Who | Auth | Close codes |
|---|---|---|---|
| `/ws/games/{game_id}` | players | none | 4404 unknown game |
| `/ws/admin` | admin dashboard | `admin_session` cookie | 4401 unauthorized |
| `/ws/admin/games/{game_id}` | admin link control | `admin_session` cookie | 4401 unauthorized, 4404 unknown/non-admin-link game |

### 9.1 Player socket events — `/ws/games/{game_id}`
On connect: increment the player count, call `mark_opened`, then send `state`.
```jsonc
{"type": "state", "state": PublicGameState}           // on connect + after every public change
{"type": "spin_started", "spin": SpinStarted}
{"type": "spin_finished", "spin_id": 4, "winner_entry_id": "en_…", "winner_name": "Jonas"}
                                                       // always followed by a "state" event
{"type": "game_deleted"}                               // then socket closes
```

### 9.2 Admin link socket events — `/ws/admin/games/{game_id}`
```jsonc
{"type": "admin_state", "state": AdminGameState}      // on connect + after ANY change (entries, rules,
                                                       // presence, spin start/finish, settings)
{"type": "spin_started", "spin": SpinStarted, "rule_applied": true}
{"type": "spin_finished", "spin_id": 4, "winner_entry_id": "en_…", "winner_name": "Jonas"}
{"type": "game_deleted"}
```

### 9.3 Admin dashboard socket — `/ws/admin`
```jsonc
{"type": "dashboard", "dashboard": Dashboard}         // on connect + whenever any link changes,
                                                       // any presence changes, or live_games changes
```
The server may throttle dashboard pushes to ≤ 4 per second (coalescing).

### 9.4 Spin lifecycle (server, `services/spins.py`)
1. `POST /spin`: if the game has an active spin → 409 `spin_in_progress`. If < 2 active entries → 409 `not_enough_entries`.
2. Read the game's **current** `mode` + `target_names`, call `pick_winner(...)` and `generate_spin_params(rng, SPIN_DURATION_MS_MIN, SPIN_DURATION_MS_MAX)`.
3. `record_spin(...)`, store `SpinStarted` as the game's in-memory `current_spin` (also reflected in `PublicGameState.current_spin`).
4. Broadcast `spin_started` (player version without `rule_applied`; admin version with it), and return 202 with the same `SpinStarted`.
5. Schedule an asyncio task: sleep `duration_ms + 300` ms, then `finish_spin`, apply remove-winner (`update_entry(is_active=False)`) if the setting is on, clear `current_spin`, set `last_result`, broadcast `spin_finished`, then `state` / `admin_state` / `dashboard`.
6. On startup, call `finish_dangling_spins()`.

---

## 10. Secrecy Requirements (hard requirements, verified by tests)

1. `PublicGameState`, `SpinStarted`, player socket messages and all public REST responses **never** contain: `mode`, `target_names`, `label`, `origin`, `rule_status`, `rule_applied`, `matched_*`, or any other rig information.
2. A public game and an admin-link game with the same entries produce JSON with **identical key structure**.
3. Admin rule/label changes produce **zero** messages on player sockets (no timing side-channel).
4. Same ID format and same URL shape (`/g/{id}`) for public games and links.
5. Spin parameter distributions are identical for fair and rigged spins; the landing point is random inside the slice (never the exact center).
6. The friend-facing page never requests anything under `/api/admin` or `/ws/admin`.
7. All admin frontend code is in a **lazy-loaded chunk**: `const AdminApp = lazy(() => import("./admin/AdminApp"))`. The main bundle must not contain the string `/api/admin`.
8. Same page `<title>` ("Spin the Wheel") everywhere on friend-facing pages; nothing in the UI hints at rigging.

---

## 11. Frontend Specification

### 11.1 Shared TypeScript types — `src/lib/types.ts` (wheel produces, admin consumes)
```ts
export type Mode = "fair" | "always" | "never";

export interface Entry { id: string; name: string; color: string; position: number; is_active: boolean; }
export interface GameSettings { remove_winner: boolean; }
export interface SpinStarted {
  spin_id: number; winner_entry_id: string; winner_name: string;
  wheel_entry_ids: string[]; winner_index: number;
  landing_offset: number; extra_rotations: number; duration_ms: number; started_at: string;
}
export interface LastResult { spin_id: number; winner_entry_id: string; winner_name: string; finished_at: string; }
export interface PublicGameState {
  id: string; game_type: "wheel"; entries: Entry[]; settings: GameSettings;
  current_spin: SpinStarted | null; last_result: LastResult | null;
}
export interface ApiErrorBody { error: { code: string; message: string } }

export type PlayerEvent =
  | { type: "state"; state: PublicGameState }
  | { type: "spin_started"; spin: SpinStarted }
  | { type: "spin_finished"; spin_id: number; winner_entry_id: string; winner_name: string }
  | { type: "game_deleted" };
```

### 11.2 Admin types — `src/admin/adminTypes.ts` (admin owns)
```ts
import type { Mode, PublicGameState, SpinStarted } from "../lib/types";
export type LinkStatus = "created" | "connected" | "disconnected";
export type RuleState = "fair_mode" | "active" | "no_match" | "all_excluded";
export interface LinkSummary {
  id: string; path: string; label: string | null; mode: Mode; target_names: string[];
  status: LinkStatus; player_count: number; entry_count: number;
  created_at: string; first_opened_at: string | null; last_activity_at: string;
}
export interface RuleStatus { state: RuleState; matched_target: string | null; matched_entry_ids: string[]; }
export interface AdminSpinRecord {
  spin_id: number; winner_entry_id: string; winner_name: string; mode: Mode;
  rule_applied: boolean; started_at: string; finished_at: string | null;
}
export interface AdminGameState { game: PublicGameState; link: LinkSummary; rule_status: RuleStatus; spin_history: AdminSpinRecord[]; }
export interface Dashboard { live_games: number; links: LinkSummary[]; }
export type AdminLinkEvent =
  | { type: "admin_state"; state: AdminGameState }
  | { type: "spin_started"; spin: SpinStarted; rule_applied: boolean }
  | { type: "spin_finished"; spin_id: number; winner_entry_id: string; winner_name: string }
  | { type: "game_deleted" };
export type DashboardEvent = { type: "dashboard"; dashboard: Dashboard };
```

### 11.3 API + WS clients
`src/lib/api.ts` (wheel). All requests use relative URLs, `credentials: "same-origin"`, and JSON bodies. Non-2xx responses throw `ApiError` (`status`, `code`, `message` from the envelope).
```ts
export class ApiError extends Error { status: number; code: string; }
export function createGame(): Promise<PublicGameState>                         // POST /api/games
export function getGame(id: string): Promise<PublicGameState>                  // GET  /api/games/{id}
export function addEntries(id: string, names: string[]): Promise<PublicGameState>
export function updateEntry(id: string, entryId: string,
  patch: { name?: string; color?: string; is_active?: boolean }): Promise<PublicGameState>
export function deleteEntry(id: string, entryId: string): Promise<PublicGameState>
export function shuffleEntries(id: string): Promise<PublicGameState>
export function restoreEntries(id: string): Promise<PublicGameState>
export function updateSettings(id: string, s: { remove_winner: boolean }): Promise<PublicGameState>
export function spin(id: string): Promise<SpinStarted>
export async function request<T>(method: string, path: string, body?: unknown): Promise<T>  // exported for admin reuse
```
`src/lib/ws.ts` (wheel):
```ts
// Auto-reconnects with backoff 1s, 2s, 5s (max). Returns a disposer. Does not reconnect after close codes 4401/4404
// or after a "game_deleted" event.
export function openSocket<T>(path: string, onEvent: (e: T) => void,
  onClose?: (code: number) => void): () => void
export function connectGameSocket(gameId: string, onEvent: (e: PlayerEvent) => void,
  onClose?: (code: number) => void): () => void       // path /ws/games/{gameId}
```
`src/admin/adminApi.ts` (admin) wraps `request` for: `login`, `logout`, `me`, `getDashboard`, `createLink`, `getLink`, `updateLink`, `deleteLink` (exact paths from §8.2).

### 11.4 Wheel math — `src/components/wheel/wheelMath.ts` (wheel owns; unit tested)
- `n` = `wheel_entry_ids.length`, slice angle `s = 360 / n`.
- Slice `i` covers wheel-local angles `[i·s, (i+1)·s)`, measured **clockwise** from the wheel's 0° mark.
- The wheel is drawn rotated by `rotation` degrees clockwise. The pointer is fixed at **12 o'clock**. The wheel-local angle under the pointer = `mod(-rotation, 360)`.
- Canvas drawing: `ctx.rotate(rotation in radians)`, then slice `i` spans canvas angles `(i·s − 90)°` → `((i+1)·s − 90)°`.
```ts
export const mod = (a: number, m: number) => ((a % m) + m) % m;
export function sliceAtPointer(rotation: number, n: number): number   // floor(mod(-rotation,360) / (360/n))
export function computeFinalRotation(current: number, winnerIndex: number, n: number,
  landingOffset: number, extraRotations: number): number {
  const s = 360 / n;
  const a = (winnerIndex + landingOffset) * s;           // target wheel-local angle
  return current + extraRotations * 360 + mod(-a - current, 360);
}
```
Required tests: for `n` in 2..12, every `winnerIndex`, offsets {0.08, 0.5, 0.92}, and several `current` values (including negatives and > 360), `sliceAtPointer(computeFinalRotation(...), n) === winnerIndex`, and the final rotation is always > `current`.

### 11.5 `Wheel` component — `src/components/wheel/Wheel.tsx` (wheel produces, admin consumes)
```ts
interface WheelProps {
  entries: Entry[];                       // full list; draws active ones in position order when idle
  spin: SpinStarted | null;               // a new spin_id starts an animation; same spin_id twice = no-op
  onSpinComplete?: (spin: SpinStarted) => void;
  soundEnabled?: boolean;                 // tick on each slice crossing + win sound (Web Audio, no files)
  size?: number;                          // px; default fills container width (square)
  ariaLabel?: string;                     // default "Wheel with {n} names"
}
```
- Canvas, high-DPI aware, `role="img"`.
- Easing: ease-out (e.g. cubic or quartic) over `duration_ms`, from the current rotation to `computeFinalRotation(...)`.
- **While animating, draw the slices from `spin.wheel_entry_ids` (snapshot) and ignore `entries` changes until the animation completes.** This matters because the server's remove-winner update can arrive just before the client animation ends; without the snapshot the winner's slice would vanish mid-spin.
- If the component mounts with a `spin` that is already in progress (a late joiner), jump to the final rotation and wait for completion; don't replay the animation.
- Slice text is readable on every palette color (white with a subtle shadow, or contrast-picked); long names are truncated with an ellipsis.

### 11.6 Pages & routing (wheel)
| Route | Behavior |
|---|---|
| `/` | If localStorage `lastGameId` exists and `getGame` succeeds → redirect to `/g/{id}`. Otherwise `createGame()` → redirect. |
| `/g/:gameId` | Game page. 404 → NotFound view "This wheel doesn't exist" + "Create a new wheel" button. Saves `lastGameId`. |
| `/admin/*` | `<Suspense>` + lazy `AdminApp` (admin agent handles sub-routes). |
| `*` | NotFound page. |

**Game page features (all v1):**
- Add a name (input + button); "Paste names" dialog (textarea, one name per line, blanks ignored).
- Entry list: edit name inline, change color (native color input), hide/show (toggle `is_active`), delete. Inactive entries are shown greyed out below the active ones.
- Shuffle, "Restore all names", and a "Remove winner after spin" toggle (synced setting).
- Spin button (also triggered by clicking the wheel). Disabled while `current_spin` is set or with < 2 active entries. With exactly 1 active entry, show "{name} is the last one standing".
- On `onSpinComplete`: result dialog with the winner's name + confetti (canvas-confetti) + win sound. The dialog has "Close" and, when remove-winner is off, a "Remove from wheel" button (PATCH `is_active: false`).
- An `aria-live="polite"` status region: "Spinning…" / "Winner: {name}".
- Toolbar: "New wheel" (createGame → navigate), "Copy link", sound toggle, theme toggle.
- All edit controls are disabled while a spin is in progress (the server would 409 anyway). API errors show as a small toast with `error.message`.
- Socket handling: on `state` replace the state; on `spin_started` pass the spin to `Wheel`; on `game_deleted` show the NotFound view.
- The spin caller animates from **whichever arrives first**, the HTTP 202 body or the `spin_started` event (dedupe by `spin_id`).

**Layout & style:** Tailwind v4, class-based dark mode (`@custom-variant dark (&:where(.dark, .dark *));`). The theme follows the system by default; the toggle saves to localStorage. Desktop: wheel on the left, entry panel on the right. Mobile (< 768px): wheel on top, panel below, no horizontal scroll. Lucide icons. The look should be playful and polished, like a real party tool.

### 11.7 Admin UI (admin agent)
`AdminApp` routes: `/admin` (Login when not authenticated, else Dashboard) and `/admin/links/:gameId` (LinkControlPage). Authentication is checked with `GET /api/admin/me`; any 401 → Login. The UI must be fully usable on a phone (it is the "other device").

**Dashboard**
- Live counter: "{n} games live right now" (`data-testid="live-games-count"` holding just the number).
- "Create link" form: label, mode (radio Fair/Always/Never), target names (textarea, one per line). On submit → `createLink` → **navigate straight to that link's control page**.
- Link list (live via `/ws/admin`): label (or "Untitled"), status badge (Created ⚪ / Connected 🟢 / Disconnected 🔘), mode, players, active entries, last activity (relative time). Per-row: open controls, copy link, delete (with an inline confirm step; no `window.confirm`).
- Log out button.

**Link control page** (live via `/ws/admin/games/{id}`)
- The full link URL (`${location.origin}/g/{id}`) as text + copy button; status badge; player count.
- Rule controls: mode radio (applies **immediately** on change via PATCH), target names textarea + "Save target names" button, label edit.
- Rule status banner (`data-testid="rule-status"`):
  - `fair_mode` → "Fair — no rigging"
  - `active` → "Rigged: {matched_target} will ALWAYS / NEVER win"
  - `no_match` → warning "None of your target names are on the wheel yet — spins are fair"
  - `all_excluded` → warning "Every name on the wheel is excluded — spins are fair"
- Live read-only wheel (reuses `Wheel`, sound off by default) that animates when the friend spins. Entry list is read-only; entries that are X are highlighted.
- Spin history table: time, winner, mode, rule applied ✓/–.
- Back to dashboard; delete link.

### 11.8 Required accessible names (used by E2E tests — exact strings)
| Element | Accessible name / test id |
|---|---|
| New name input / add button | `aria-label="New name"` / button "Add name" |
| Paste dialog open / textarea / submit | button "Paste names" / `aria-label="Names, one per line"` / button "Add names" |
| Per entry | buttons "Edit {name}", "Change color for {name}", "Hide {name}" or "Show {name}", "Remove {name}" |
| Toolbar | "Shuffle names", "Restore all names", switch "Remove winner after spin", "Toggle sound", "Toggle dark mode", "New wheel", "Copy link" |
| Spin | button "Spin the wheel" |
| Result dialog | `role="dialog"` named "Result"; winner text `data-testid="winner-name"`; buttons "Close", "Remove from wheel" |
| Admin login | `aria-label="Admin password"`, button "Log in" |
| Admin create form | `aria-label="Link label"`, radio group "Mode" with options "Fair"/"Always"/"Never", `aria-label="Target names"`, button "Create link" |
| Admin rows | "Open controls for {label}", "Copy link for {label}", "Delete link {label}", status `data-testid="link-status"` (text Created/Connected/Disconnected) |
| Control page | `data-testid="link-url"`, `data-testid="rule-status"`, button "Save target names", `data-testid="player-count"`, button "Back to dashboard", button "Log out" |

Interactive elements must always be visible and focusable (no `opacity-0` without a focus/hover fallback).

---

## 12. Validation

Every agent validates its own domain before reporting done. The lead runs the full end-to-end validation at the end.

### 12.1 Core validation (run from `backend/`)
```bash
python -m pytest tests/core -q
```
Required tests in `tests/core/` (pytest-asyncio, temp DB per test via `init_db(tmp_path / "t.db")`):
- **normalize_name**: every row of the §1.4 table, plus `"Bjorn" != "Bjørn"` after normalization.
- **evaluate_rule**:
  - targets `["Erik", "Jonas"]`, entries `[Anna, Jonas]` → `active`, `matched_target == "Jonas"`
  - targets `["Jonas", "Anna"]`, both present → `Jonas`
  - target `"!!!"` is skipped
  - targets with no match → `no_match`
  - `never` with entries `[Jonas, " jonas "]` → `all_excluded`
  - fair → `fair_mode`
- **pick_winner**:
  - fair: 12,000 picks over 4 entries, each count within 3000 ± 300
  - always: 1000/1000 X; duplicate X entries (`["Jonas", "JONAS", "Per"]`) are both picked at least once and Per never is
  - never: 0/1000 X
  - all_excluded / no_match → `rule_applied is False` and picks are spread over all entries
  - empty list → `ValueError`
- **generate_spin_params**: 1000 samples stay within the ranges; `min_ms`/`max_ms` are respected.
- **repository**:
  - create/get game; ids match `^[a-z0-9]{8}$`, entry ids `^en_[a-z0-9]{10}$`
  - `add_entries` positions are 0..n-1 and colors cycle through PALETTE
  - `shuffle_entries` keeps the same set of ids
  - `restore_entries`, `update_entry` (including `None` for a foreign entry), `delete_entry`
  - `delete_game` cascades (entries + spins gone)
  - `mark_opened` only sets once
  - `list_admin_links` excludes public games
  - `delete_inactive_public_games` deletes old public games and **never** admin links
  - `record_spin` / `finish_spin` / `list_spins` order / `get_last_finished_spin`
  - `finish_dangling_spins`
- **models**: `PublicGameState.model_json_schema()` property names contain none of the §10.1 forbidden keys.

### 12.2 Server validation (run from `backend/`)
```bash
python -m pytest tests/server -q          # FastAPI TestClient: every §8 endpoint, every error code, WS close codes

# Start the server for smoke tests (short spins for speed):
ADMIN_PASSWORD=testpass SPIN_DURATION_MS_MIN=300 SPIN_DURATION_MS_MAX=400 \
DATABASE_PATH=./data/smoke.db uvicorn app.main:app --port 8000 --workers 1 &
sleep 2
bash scripts/smoke_api.sh
ADMIN_PASSWORD=testpass python scripts/smoke_realtime.py
```

`scripts/smoke_api.sh` (server agent creates it with exactly this content, fixing only genuine bugs in the script after telling the lead):
```bash
#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://localhost:8000}
PW=${ADMIN_PASSWORD:-testpass}
CJ=$(mktemp)
H='Content-Type: application/json'
ok(){ echo "✓ $1"; }
fail(){ echo "✗ $1"; exit 1; }
expect_code(){ local want=$1 desc=$2; shift 2; local got
  got=$(curl -s -o /dev/null -w '%{http_code}' "$@")
  [ "$got" = "$want" ] && ok "$desc" || fail "$desc (expected $want, got $got)"; }
expect_jq(){ local desc=$1 filter=$2; shift 2
  curl -s "$@" | jq -e "$filter" >/dev/null && ok "$desc" || fail "$desc"; }
shape(){ jq -c '[paths | map(if type=="number" then "N" else . end) | join(".")] | unique'; }

expect_jq   "health"                          '.status=="ok"'                      $BASE/api/health
expect_code 201 "POST /api/games is 201"       -X POST $BASE/api/games
GAME=$(curl -sf -X POST $BASE/api/games | jq -r '.id')
[[ "$GAME" =~ ^[a-z0-9]{8}$ ]] && ok "game id format" || fail "game id format: $GAME"

expect_jq   "entries added"  '(.entries|length)==4 and all(.entries[]; .is_active)' \
            -X POST $BASE/api/games/$GAME/entries -H "$H" -d '{"names":["Anna","Jonas","Per","Kari"]}'
expect_code 404 "trailing slash rejected"      $BASE/api/games/$GAME/
expect_jq   "404 error envelope"  '.error.code=="game_not_found"'                  $BASE/api/games/zzzzzzzz
expect_jq   "422 error envelope"  '.error.code=="validation_error"' \
            -X POST $BASE/api/games/$GAME/entries -H "$H" -d '{"names":[]}'

expect_code 401 "dashboard requires auth"      $BASE/api/admin/dashboard
expect_code 401 "wrong password rejected"      -X POST $BASE/api/admin/login -H "$H" -d '{"password":"wrong"}'
expect_jq   "admin login"  '.ok==true'  -c $CJ -X POST $BASE/api/admin/login -H "$H" -d "{\"password\":\"$PW\"}"

LINK=$(curl -sf -b $CJ -X POST $BASE/api/admin/links -H "$H" \
       -d '{"label":"Smoke","mode":"always","target_names":["Erik","jonas"]}' | jq -r '.game.id')
[[ "$LINK" =~ ^[a-z0-9]{8}$ ]] && ok "link id format" || fail "link id format: $LINK"
expect_jq   "link starts as created"  '.link.status=="created" and .link.first_opened_at==null' \
            -b $CJ $BASE/api/admin/links/$LINK

curl -sf $BASE/api/games/$LINK >/dev/null
expect_jq   "friend open is tracked"  '.link.first_opened_at!=null and .link.status=="disconnected"' \
            -b $CJ $BASE/api/admin/links/$LINK
curl -sf -X POST $BASE/api/games/$LINK/entries -H "$H" -d '{"names":["Anna","  JONAS ","Per","Kari"]}' >/dev/null
expect_jq   "priority list + normalization"  '.rule_status.state=="active" and .rule_status.matched_target=="jonas"' \
            -b $CJ $BASE/api/admin/links/$LINK

A=$(curl -sf $BASE/api/games/$GAME | shape); B=$(curl -sf $BASE/api/games/$LINK | shape)
[ "$A" = "$B" ] && ok "public and link games have identical shape" || fail "shape differs"
if curl -sf $BASE/api/games/$LINK | grep -Eq '"(mode|target_names|label|origin|rule_status|rule_applied|matched_target)"'; then
  fail "rig info leaked in public state"; else ok "no rig info in public state"; fi

for i in 1 2 3 4 5 6 7 8; do
  W=$(curl -sf -X POST $BASE/api/games/$LINK/spin | jq -r '.winner_name')
  [ "$(echo "$W" | tr 'A-Z' 'a-z')" = "jonas" ] || fail "always-mode spin $i won by $W"
  sleep 0.8
done
ok "always mode: JONAS won 8/8"

curl -sf -X POST $BASE/api/games/$LINK/spin >/dev/null
expect_code 409 "concurrent spin rejected"     -X POST $BASE/api/games/$LINK/spin
expect_jq   "edits blocked during spin"  '.error.code=="spin_in_progress"' \
            -X POST $BASE/api/games/$LINK/entries -H "$H" -d '{"names":["X"]}'
sleep 0.8

expect_jq   "switch to never"  '.link.mode=="never"' -b $CJ -X PATCH $BASE/api/admin/links/$LINK -H "$H" -d '{"mode":"never"}'
curl -sf -X PATCH $BASE/api/games/$LINK/settings -H "$H" -d '{"remove_winner":true}' >/dev/null
for i in 1 2 3; do
  W=$(curl -sf -X POST $BASE/api/games/$LINK/spin | jq -r '.winner_name')
  [ "$(echo "$W" | tr 'A-Z' 'a-z')" != "jonas" ] || fail "never-mode picked JONAS"
  sleep 0.8
done
expect_jq   "never + remove winner: JONAS last standing"  '[.entries[]|select(.is_active)|.name]==["JONAS"]' $BASE/api/games/$LINK
expect_jq   "single entry cannot spin"  '.error.code=="not_enough_entries"' -X POST $BASE/api/games/$LINK/spin

expect_jq   "restore all"  'all(.entries[]; .is_active)'  -X POST $BASE/api/games/$LINK/restore
expect_jq   "spin history"  '(.spin_history|length)==12 and all(.spin_history[]; has("rule_applied"))' \
            -b $CJ $BASE/api/admin/links/$LINK
expect_jq   "dashboard lists link"  "(.live_games|type)==\"number\" and any(.links[]; .id==\"$LINK\")" \
            -b $CJ $BASE/api/admin/dashboard
expect_jq   "public games not in link list"  "all(.links[]; .id!=\"$GAME\")"  -b $CJ $BASE/api/admin/dashboard
expect_code 404 "public game not reachable as admin link"  -b $CJ $BASE/api/admin/links/$GAME

expect_code 204 "delete link"                  -b $CJ -X DELETE $BASE/api/admin/links/$LINK
expect_code 404 "deleted link is gone"         $BASE/api/games/$LINK
expect_code 204 "logout"                       -b $CJ -c $CJ -X POST $BASE/api/admin/logout
expect_code 401 "logged out"                   -b $CJ $BASE/api/admin/dashboard
echo "ALL API SMOKE CHECKS PASSED"
```

`scripts/smoke_realtime.py` (same rule as above):
```python
"""Realtime smoke test. Run from backend/ with the server running (see §12.2)."""
import asyncio, json, os
import httpx, websockets

BASE = os.environ.get("BASE", "http://localhost:8000")
WS = BASE.replace("http", "ws", 1)
PW = os.environ.get("ADMIN_PASSWORD", "testpass")
FORBIDDEN = {"mode", "target_names", "label", "origin", "rule_status", "rule_applied", "matched_target", "matched_entry_ids"}

def ok(m): print(f"✓ {m}")

def assert_no_leak(obj):
    if isinstance(obj, dict):
        leaked = FORBIDDEN & obj.keys()
        assert not leaked, f"leaked keys {leaked}"
        for v in obj.values(): assert_no_leak(v)
    elif isinstance(obj, list):
        for v in obj: assert_no_leak(v)

async def next_event(ws, pred, timeout=5.0):
    async def loop():
        while True:
            m = json.loads(await ws.recv())
            if pred(m): return m
    return await asyncio.wait_for(loop(), timeout)

async def expect_close(url, code, headers=None):
    async with websockets.connect(url, additional_headers=headers) as ws:
        try:
            await asyncio.wait_for(ws.recv(), 3)
            raise AssertionError(f"{url} was not closed")
        except websockets.exceptions.ConnectionClosed as e:
            assert e.rcvd is not None and e.rcvd.code == code, f"expected close {code}, got {e.rcvd}"

async def main():
    async with httpx.AsyncClient(base_url=BASE) as http:
        r = await http.post("/api/admin/login", json={"password": PW}); assert r.status_code == 200, r.text
        cookie = {"Cookie": f"admin_session={http.cookies.get('admin_session')}"}
        r = await http.post("/api/admin/links", json={"label": "rt", "mode": "always", "target_names": ["Jonas"]})
        assert r.status_code == 201, r.text
        link = r.json()["game"]["id"]

        await expect_close(f"{WS}/ws/admin/games/{link}", 4401); ok("admin socket without cookie → 4401")
        await expect_close(f"{WS}/ws/games/zzzzzzzz", 4404);     ok("unknown game socket → 4404")

        async with websockets.connect(f"{WS}/ws/admin", additional_headers=cookie) as dash, \
                   websockets.connect(f"{WS}/ws/admin/games/{link}", additional_headers=cookie) as adm:
            live0 = (await next_event(dash, lambda m: m["type"] == "dashboard"))["dashboard"]["live_games"]
            a0 = await next_event(adm, lambda m: m["type"] == "admin_state")
            assert a0["state"]["link"]["status"] == "created"; ok("admin_state on connect, status created")

            async with websockets.connect(f"{WS}/ws/games/{link}") as player:
                p0 = await next_event(player, lambda m: m["type"] == "state"); assert_no_leak(p0)
                await next_event(adm, lambda m: m["type"] == "admin_state"
                                 and m["state"]["link"]["status"] == "connected"
                                 and m["state"]["link"]["player_count"] == 1)
                ok("admin sees friend connect live")
                await next_event(dash, lambda m: m["dashboard"]["live_games"] == live0 + 1)
                ok("live counter increments")

                await http.post(f"/api/games/{link}/entries", json={"names": ["Anna", "Jonas", "Per"]})
                await next_event(player, lambda m: m["type"] == "state" and len(m["state"]["entries"]) == 3)
                await next_event(adm, lambda m: m["type"] == "admin_state"
                                 and len(m["state"]["game"]["entries"]) == 3
                                 and m["state"]["rule_status"]["state"] == "active")
                ok("entries sync to player and admin")

                r = await http.post(f"/api/games/{link}/spin"); assert r.status_code == 202, r.text
                ps = await next_event(player, lambda m: m["type"] == "spin_started")
                assert_no_leak(ps); assert ps["spin"]["winner_name"] == "Jonas"
                asp = await next_event(adm, lambda m: m["type"] == "spin_started")
                assert asp["rule_applied"] is True
                await next_event(player, lambda m: m["type"] == "spin_finished", timeout=10)
                await next_event(player, lambda m: m["type"] == "state", timeout=5)
                ok("spin broadcast; rule_applied only on admin socket")

                await http.patch(f"/api/admin/links/{link}", json={"mode": "never", "label": "changed"})
                await next_event(adm, lambda m: m["type"] == "admin_state" and m["state"]["link"]["mode"] == "never")
                try:
                    msg = await asyncio.wait_for(player.recv(), 1.5)
                    raise AssertionError(f"player got a message after a rule change: {msg}")
                except asyncio.TimeoutError:
                    ok("rule change invisible to players")

            await next_event(adm, lambda m: m["type"] == "admin_state" and m["state"]["link"]["status"] == "disconnected")
            ok("admin sees friend disconnect")

        async with websockets.connect(f"{WS}/ws/games/{link}") as player:
            await next_event(player, lambda m: m["type"] == "state")
            await http.delete(f"/api/admin/links/{link}")
            await next_event(player, lambda m: m["type"] == "game_deleted")
            ok("players notified on link delete")
    print("ALL REALTIME SMOKE CHECKS PASSED")

asyncio.run(main())
```

Required `tests/server/` coverage (TestClient):
- every §8 route's success code
- every error code in the §8 table
- `redirect_slashes=False` behavior
- cookie auth on every admin route
- WS close codes 4401/4404
- the player socket receives no message on a rule PATCH
- the spin lock
- remove-winner applied at spin finish
- a link GET by admin does not set `first_opened_at`
- cleanup deletes only public games

### 12.3 Frontend validation (run from `frontend/`) — wheel and admin agents
```bash
npm install
npm run typecheck        # tsc --noEmit, zero errors
npm run test             # vitest run (wheelMath tests must pass)
npm run build            # vite build
# Admin code must be split out of the main bundle:
! grep -l "/api/admin" dist/assets/index-*.js && echo "✓ admin code is lazy-loaded"
npm run dev &            # :5173
```
Static UI checks with agent-browser. These need no backend for layout; with the backend running on :8000, also exercise the flows.
```bash
agent-browser open "http://localhost:5173/g/test"   # NotFound view without backend; full page with backend
agent-browser snapshot -i
agent-browser open "http://localhost:5173/admin"
agent-browser snapshot -i                           # login form: "Admin password", "Log in"
agent-browser screenshot frontend-validation.png
```
- **wheel** verifies: game page renders; every §11.8 player label exists; paste dialog opens and closes; the theme toggle switches dark/light; no console errors; the layout works at 390px and 1280px widths.
- **admin** verifies: login renders; with the backend running, login → dashboard → create link navigates to the control page; every §11.8 admin label exists; the layout works at 390px width.

### 12.4 End-to-End Validation (Lead)
**No mocking.** Use real servers, real browsers and two separate browser sessions (admin device + friend device). Check `agent-browser --help` for the exact session and viewport flags; the commands below use `--session`.

```bash
cd backend && ADMIN_PASSWORD=e2epass DATABASE_PATH=./data/e2e.db uvicorn app.main:app --port 8000 --workers 1 &
cd frontend && npm run dev &
sleep 5
```

| # | Session | Action | Expect |
|---|---|---|---|
| 1 | admin | open `/admin`, fill "Admin password" = e2epass, click "Log in" | Dashboard with live counter |
| 2 | admin | Create link: label "E2E Party", mode Always, targets `Erik` / `Jonas` | Lands on the control page; status Created; rule-status warns no match |
| 3 | admin | read `link-url` | URL of form `http://localhost:5173/g/xxxxxxxx` |
| 4 | friend | open the link URL | Normal wheel page; nothing hints at rigging |
| 5 | admin | snapshot | Status **Connected**, player-count 1 |
| 6 | friend | "Paste names": Anna, Jonas, Per, Kari → "Add names" | 4 slices |
| 7 | admin | snapshot | The 4 names appear live; rule-status "Rigged: Jonas will ALWAYS win" |
| 8 | friend | "Spin the wheel" ×3 (wait ~8 s each, close the result) | winner-name = Jonas all 3 times; the wheel visibly animates (take a screenshot mid-spin) |
| 9 | admin | snapshot | The live wheel animated; history shows 3 spins, rule applied ✓ |
| 10 | admin | switch mode to **Never** (no reload anywhere) | rule-status "NEVER" |
| 11 | friend | turn on "Remove winner after spin", spin ×3 | Jonas never wins; he ends as "Jonas is the last one standing"; spin disabled |
| 12 | friend | `agent-browser eval "performance.getEntriesByType('resource').filter(r => r.name.includes('/admin')).length"` | `0` |
| 13 | friend | "Restore all names"; reload the page | Same wheel with 4 names (persistence) |
| 14 | friend2 | open the same link URL | Same names; admin player-count 2 |
| 15 | admin | set mode **Fair**; friend spins | friend2 sees the same spin animate and the same result (shared wheel) |
| 16 | friend, friend2 | close the sessions | Admin status **Disconnected** |
| 17 | public | new session, open `/` | Redirected to `/g/<new id>`; add 3 names, spin, result dialog + confetti; admin live counter increased while open; not listed as a link |
| 18 | admin | Delete "E2E Party" (confirm) | Gone from the list |
| 19 | all | set viewport 390×844, screenshot game page + admin control page | Usable, no horizontal scroll |
| 20 | admin | "Log out", open `/admin` | Login form |

**Success criteria:**
- All 20 steps pass.
- No server errors in the uvicorn output, and no console errors.
- Animations are visibly incremental.
- Rigging is never visible on the friend side.
- Both smoke scripts pass against the running server.
- Contract diff is clean (below).

### 12.5 Contract diff (lead, before E2E)
```bash
cd backend && python -c "from app.main import app; [print(sorted(r.methods or ['WS']), r.path) for r in app.routes]"
cd frontend && grep -rnoE "[\"'\`]/(api|ws)/[^\"'\`]*" src
```
Every frontend path must exist in the backend list with the same method and no trailing slash.

---

## 13. Dependencies & Config

`backend/requirements.txt`
```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
aiosqlite>=0.20.0
pydantic>=2.7.0
python-dotenv>=1.0.0
```
`backend/requirements-dev.txt`
```
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.27.0
websockets>=14.0
```
`frontend/package.json` dependencies: `react`, `react-dom`, `react-router-dom`, `lucide-react`, `canvas-confetti`.
devDependencies: `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `@types/react`, `@types/react-dom`, `@types/canvas-confetti`.
Scripts: `dev`, `build`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `preview`.

`vite.config.ts` proxy:
```ts
server: { proxy: {
  "/api": "http://localhost:8000",
  "/ws":  { target: "ws://localhost:8000", ws: true },
}}
```

Environment (`backend/.env.example`). `config.py` loads `.env` with `override=False`, so real env vars win:
| Var | Default | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | — | **Required.** App exits at startup with a clear message if missing. |
| `DATABASE_PATH` | `./data/app.db` | |
| `GAME_TTL_DAYS` | `7` | public games only |
| `COOKIE_SECURE` | `false` | `true` when served over HTTPS |
| `SPIN_DURATION_MS_MIN` | `4500` | tests use 300 |
| `SPIN_DURATION_MS_MAX` | `7000` | tests use 400 |
| `FRONTEND_DIST` | `../frontend/dist` | served if it exists |

**Static serving (server):** if `FRONTEND_DIST` exists, mount `/assets`, and for any other GET not starting with `/api` or `/ws`, return `index.html` (SPA fallback).

**Dockerfile (server):** multi-stage. A Node stage builds the frontend; a Python 3.12-slim stage installs requirements, copies the backend + `frontend/dist`, and runs `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1`. `DATABASE_PATH` should point at a mounted volume when deployed (e.g. Railway or Fly.io volume).

**README (server):** local setup (venv, npm), how to run both dev servers, env vars, how to run all validations, deployment notes.

---

## 14. Cross-Cutting Concerns

| Concern | Owner | Coordinates with | Detail |
|---|---|---|---|
| Rig secrecy | server | core, wheel, admin | §10. The serializers in `services/serializers.py` are the only place public JSON is built. |
| No trailing slashes | server | wheel, admin | `redirect_slashes=False`; the frontend uses exact §8 paths. |
| Error envelope | server | core (models), wheel, admin | All errors are `{"error":{code,message}}`, including 422; the UI shows `message`. |
| Name normalization | core | server | Only `normalize_name` is used for matching; the UI never re-implements matching. |
| Timestamps | core | all | ISO UTC with `Z`; the frontend formats them for display. |
| Spin timing & lock | server | wheel, admin | Server lock = `duration_ms + 300`; the UI disables controls while `current_spin` is set. |
| Wheel geometry | wheel | admin, server | §11.4 math; the server only sends `winner_index`, `landing_offset`, `extra_rotations`, `duration_ms`. |
| Remove-winner timing | server + wheel | admin | The server deactivates at finish; `Wheel` keeps the snapshot until its animation ends. |
| Presence counting | server | admin | Only player sockets count; `mark_opened` comes only from player GET/WS. |
| Rule-change silence | server | — | A rule PATCH never touches player sockets. |
| Lazy admin bundle | wheel (App.tsx) | admin | `lazy(() => import("./admin/AdminApp"))`; checked by grep in §12.3. |
| Accessibility labels | wheel, admin | lead (E2E) | Exact strings in §11.8. |
| Cookie auth over WS | server | admin | Same-origin through the Vite proxy; the admin socket reads the `admin_session` cookie. |
| Secrets | server | — | Password only from env; `.env` is gitignored. |

---

## 15. Task List (lead creates)

```
[ ] core:   rows.py + models.py first (unblocks server), then schema, repository, ids, engine, tests/core
[ ] server: config, errors, auth, realtime manager, serializers, spins service, routes, static, cleanup, tests/server, smoke scripts, Dockerfile, README
[ ] wheel:  Vite/Tailwind scaffold, lib (types/api/ws/theme/sound), wheelMath + tests, Wheel component, game page + all features
[ ] admin:  AdminApp stub (immediately), adminApi/types/socket hook, login, dashboard, link control page
[ ] lead:   contract diff (blocked by all four)
[ ] lead:   server smoke scripts against the real server (blocked by core + server)
[ ] lead:   E2E §12.4 (blocked by everything)
[ ] cross-review: wheel reviews the server API & WS usability; server reviews core query patterns; core reviews the frontend's use of rule/normalization semantics; admin reviews the Wheel component API
```

---

## 16. Acceptance Criteria

1. **Fair play:** a visitor at `/` gets a wheel and can add, paste, edit, recolor, hide and delete names, shuffle, spin, see a result popup with confetti and sound, use remove-winner and restore, and toggle dark mode, on desktop and mobile.
2. **Shareable:** every wheel has a `/g/{id}` URL; everyone on it sees the same live wheel; it survives a reload.
3. **Admin links:** the admin logs in at `/admin`, creates a link with a label, mode and priority target list, and lands on its live control screen.
4. **Live tracking:** the link shows Created → Connected → Disconnected correctly; the admin sees names, spins and results live; the dashboard shows a live-games counter.
5. **Rigging works:** always-mode makes the first matching target win every spin; never-mode never picks it; with remove-winner on, the never-target is last standing; fallbacks are fair as specified.
6. **Live changes:** changing mode or targets during play affects the next spin with no reload and no visible change on the friend's side.
7. **Undetectable:** all §10 secrecy requirements pass their tests.
8. **Cleanup:** public games idle for 7 days are deleted; admin links are not.
9. **Validation:** all of §12 passes.

---

## 17. Out of Scope for v1 (design must not block these)

- **More games:** Plinko/ball drop (deterministic physics + simulate-until-target), slot machine, marble/duck race, card flip. `game_type` already exists, and `pick_winner` is game-agnostic, so a new game = new animation + the same "outcome first" contract.
- **More rule types:** weighted odds, "rig on the Nth spin", near-miss drama, elimination order. `mode` is an enum ready to extend.
- **God mode:** list and rig any live public game from the dashboard.
- **Other:** desktop app wrapper, login rate limiting, multiple admins, actual cloud deployment.
