# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A "spin the wheel" name picker (FastAPI + SQLite backend, React/TS/Vite/Tailwind v4 frontend) that looks completely ordinary to visitors, plus a hidden controller at `/admin`. The controller creates links whose games can be rigged (`fair` / `always` X / `never` X) and changed live. The core invariant: **rigging exists only on the server and must be undetectable from the friend's browser.**

## Commands

Backend (run from `backend/`; venv at `backend/.venv`):
```bash
ADMIN_PASSWORD=devpass DATABASE_PATH=./data/dev.db .venv/bin/uvicorn app.main:app --port 8000 --workers 1 --reload
.venv/bin/python -m pytest -q                                  # all (tests/core + tests/server)
.venv/bin/python -m pytest tests/server/test_websockets.py -q   # one file
.venv/bin/python -m pytest -q -k "spin_lock"                   # by name
```
Importing `app.main` requires `ADMIN_PASSWORD` to be set (a default app is built at import time; `tests/server/conftest.py` sets env vars before importing).

Smoke tests against a live server (fresh DB required, the API script checks exact spin counts):
```bash
rm -f data/smoke.db
ADMIN_PASSWORD=testpass SPIN_DURATION_MS_MIN=300 SPIN_DURATION_MS_MAX=400 DATABASE_PATH=./data/smoke.db .venv/bin/uvicorn app.main:app --port 8100 --workers 1 &
BASE=http://localhost:8100 bash scripts/smoke_api.sh
BASE=http://localhost:8100 ADMIN_PASSWORD=testpass .venv/bin/python scripts/smoke_realtime.py
```

Frontend (run from `frontend/`; dev server on :5173 proxies `/api` and `/ws` to :8000):
```bash
npm run dev
npm run typecheck && npm run test && npm run build
npx vitest run src/components/wheel/wheelMath.test.ts           # one test file
! grep -l "/api/admin" dist/assets/index-*.js && echo "admin code is lazy-loaded"   # must pass after build
```

Production: `npm run build`, then uvicorn serves `frontend/dist` (SPA fallback) as a single service. `FRONTEND_DIST` is checked only at startup, so restart the backend after the first build. See `README.md` for env vars and Docker.

## Architecture

**Outcome first, animation second.** `POST /api/games/{id}/spin` → the server picks the winner (`engine/rigging.py: pick_winner`, using the game's *current* mode + `target_names`) and random animation params (`engine/spin_params.py`) → it broadcasts `spin_started` → every client animates the wheel to land on `winner_index` (`frontend/src/components/wheel/wheelMath.ts: computeFinalRotation`). Fair and rigged spins use identical code paths, payload shapes and param distributions.

**Communication model.** All mutations go through REST, and all live updates go server→client over WebSockets (clients never send on sockets). Clients render from server state: every `state` / `admin_state` event replaces local state. URLs have no trailing slashes (`redirect_slashes=False`; `/x/` → 404). Every error is `{"error": {"code", "message"}}`.

**Backend layers** (`backend/app/`):
- `db/`: aiosqlite repository (fresh connection per call, `PRAGMA foreign_keys=ON`, WAL); `rows.py` dataclasses.
- `engine/`: pure, game-agnostic logic: `normalize_name` (keep `isalnum` chars, then `casefold`; no accent folding), `evaluate_rule` (first target in the priority list that matches an active entry = X; falls back to fair on no match, or when `never` would exclude everyone), `pick_winner`.
- `models.py`: Pydantic API schemas = the exact JSON contract shared with the frontend.
- `services/serializers.py`: **the only place public JSON is built.** Public state must never contain `mode`, `target_names`, `label`, `origin`, `rule_status`, `rule_applied` or `matched_*`.
- `services/views.py`: builds full states and broadcasts. `notify_public_change` → players + admin + dashboard; `notify_admin_change` (rule/label/presence) → admin + dashboard **only**. A rule change must produce zero player-socket traffic (no timing side channel).
- `services/spins.py` + `services/state.py`: in-memory per-game runtime (lock, `current_spin`, `last_result`). The spin holds the lock for `duration_ms + 300`, then finishes it, applies remove-winner, and broadcasts `spin_finished` + state. Mutations during a spin → 409 `spin_in_progress`.
- `realtime/manager.py`: socket registry. Only player sockets count as players/presence; admin sockets never do. Dashboard pushes are throttled.
- `context.py`: `AppContext` on `app.state.ctx`; `main.create_app(settings)` builds an isolated app (tests use one per test).
- Live state, admin sessions and spin locks are in process memory → **always run one worker / one instance.**

**Frontend** (`frontend/src/`):
- `lib/` (`types.ts`, `api.ts`, `ws.ts`): shared clients; `ws.ts` auto-reconnects except after close codes 4401/4404 or `game_deleted`.
- `components/wheel/Wheel.tsx`: canvas wheel. While animating it draws from the `spin.wheel_entry_ids` snapshot (the server's remove-winner update can arrive before the animation ends). A spin received more than 1.5 s after `started_at` jumps to its final position, and a `setTimeout` backs up `requestAnimationFrame` so spins finish in background/headless tabs. Deduped by `spin_id` (the WS `spin_started` usually beats the HTTP 202). StrictMode is intentionally off.
- `admin/`: the whole controller, loaded only via `lazy(() => import("./admin/AdminApp"))` in `App.tsx`, mounted at `/admin/*` with relative nested routes. Never import from `src/admin` elsewhere, and never put admin paths in `src/lib`; the main bundle must not contain `/api/admin` or `/ws/admin`.
- Page titles: `Wheel · Luck Decides Your Fate` on every game page (public and admin-link alike), `Luck Decides Your Fate` everywhere else. Nothing in the friend UI may hint at rigging. The UI never re-implements name matching (the admin highlights X via the server's `rule_status.matched_entry_ids`).
- Exact accessible names and `data-testid`s (e.g. "Spin the wheel", `winner-name`, `rule-status`, `link-status`, `live-games-count`) are relied on by E2E browser tests; keep them stable.

**Extensibility:** `game_type` (always `"wheel"` today) and the `mode` enum exist so that new games (a new animation on the same "outcome first" contract) and new rule types can be added without changing the spin flow.


## Git & GitHub rules
- Never commit directly to `main`. Start every task on a new branch:
  `feat/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.
- Commit in small, logical steps with clear messages: `<type>: <summary>`
  (types: feat, fix, test, refactor, docs, chore).
- Run all tests and both smoke scripts before the final commit.
- Never commit `.env`, databases, `node_modules/`, `.venv/`, `dist/` or test output.
- When done: push the branch and open a PR to `main` with `gh pr create`,
  describing what changed and how it was tested.
- Never merge PRs, never force-push, never rewrite history on pushed branches.
  I review and merge PRs myself on GitHub.