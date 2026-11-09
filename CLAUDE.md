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

Local test environment (from the repo root): `./dev.sh` starts the backend on :8000 and the frontend on :5173 together (`--fresh`, `--seed`, `--fast`, `--phone`; see README "Running in development"). It's the user's own dev setup: when Claude verifies something it runs its own copy on other ports with its own database, e.g. `DEV_BACKEND_PORT=8210 DEV_FRONTEND_PORT=5183 DEV_SEED_PORT=8299 ./dev.sh --fresh --seed --fast` from a separate worktree, and never touches :8000, :5173 or the user's `data/dev.db`.

Frontend (run from `frontend/`; dev server on :5173 proxies `/api` and `/ws` to :8000, or to `DEV_BACKEND_PORT`):
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
- `engine/`: pure, game-agnostic logic: `normalize_name` (keep `isalnum` chars, then `casefold`; no accent folding), `evaluate_rule` (first target in the priority list that matches an active entry = X; falls back to fair on no match, or when `never` would exclude everyone), `pick_winner`. More rule settings per game: `script` (a queue of upcoming winners; its first step wins if that name is on the wheel and is then used up, else it waits), `chance` ("always" X wins that % of spins, null = every spin) and `max_streak` (the streak breaker: "always" pauses after X has won that many in a row, until someone else wins). Order: script step, then the rule. `POST /api/admin/all-fair` is the panic button (every link and wheel, and the standing rule).
- `services/control.py`: which rule decides a game. A link: its own. An ordinary solo wheel: its own once the admin set one (`own_rule`), else the **standing rule** if at least two *different* friends from the friends list are on it (`engine/friends.py`), else fair. The friends list and standing rule are in `admin_settings`. The controller lists every solo wheel (friends' wheels apart) and can take any of them over at `/admin/wheels/{id}`. Like every rule change, none of this reaches player sockets.
- `models.py`: Pydantic API schemas = the exact JSON contract shared with the frontend.
- `services/serializers.py`: **the only place public JSON is built.** Public state must never contain `mode`, `target_names`, `label`, `origin`, `rule_status`, `rule_applied` or `matched_*`. Its `recent_spins` copies three fields from finished spins only; never serialize a `SpinRow` directly.
- `services/views.py`: builds full states and broadcasts. `notify_public_change` → players + admin + dashboard; `notify_admin_change` (rule/label/presence) → admin + dashboard **only**. A rule change must produce zero player-socket traffic (no timing side channel).
- `services/players.py` + `services/tickets.py`: multiplayer games (`kind`). Players are identified by a random key (stored hashed, sent as `X-Player-Token`); in a multiplayer game only the host may spin or change anything (`require_control`), solo wheels stay open. Sockets join as a player with a single-use ticket (`?ticket=`), never the key. A player's here/away change is a public change. Players away for 10 minutes are removed by `sweep_loop`. Removals (`kicked`, `banned`, `timed_out`) are remembered in `player_removals` by key hash, so the removed browser's page can explain it (`GET .../players/me`) and a banned browser can't join. Requests to join (`join_requests`: pending → accepted → the player confirms, or declined) come from kicked players and from newcomers when the host's `join_policy` is `ask`; `closed` lets nobody new in. The host can invite kicked or banned players back (an accepted, `invited` request) or unban them. Non-players never see a multiplayer wheel except via "Just watch" in `open` games. **Nothing here may branch on `origin`**: a controller link and a player-hosted game must behave identically. The one agreed exception is `end_game` (the last player leaving): ordinary wheels are deleted, controller links only closed, with identical responses.
- `services/spins.py` + `services/state.py`: in-memory per-game runtime (lock, `current_spin`, `last_result`). The spin holds the lock for `duration_ms + 300`, then finishes it, applies remove-winner, and broadcasts `spin_finished` + state. Mutations during a spin → 409 `spin_in_progress`.
- `realtime/manager.py`: socket registry. Only player sockets count as players/presence; admin sockets never do. Dashboard pushes are throttled.
- `analytics/`: admin-only statistics for `/admin/analytics`. Each statistic is one `@metric` function in `analytics/metrics/`, and the page renders by `kind`. See `docs/analytics.md`. Never use it from public routes or player sockets.
- `context.py`: `AppContext` on `app.state.ctx`; `main.create_app(settings)` builds an isolated app (tests use one per test).
- Live state and spin locks are in process memory → **always run one worker / one instance.** Admin sessions (`auth.py`) are stored in `admin_sessions` (only an HMAC of the token, keyed with `ADMIN_PASSWORD`) and loaded into memory at startup, so a deploy doesn't log the admin out; they end after 60 days unused, 1 year at most.

**Frontend** (`frontend/src/`):
- `lib/` (`types.ts`, `api.ts`, `ws.ts`, `players.ts`, `avatars.ts`): shared clients; `players.ts` keeps this browser's player key per multiplayer game, and `api.ts` sends it on game requests; `recentGame.ts` remembers the last game for the "still going" bar (only solo wheels are saved as the last wheel `/` reopens); `ws.ts` auto-reconnects except after close codes 4401/4404 or `game_deleted`. The wheel page's socket (only) closes after its tab has been hidden for 15 s, reconnects when visible, and adds `?resume=1` to every connection after its first, so the server counts visits and visible time (`docs/analytics.md`). Hidden tabs therefore don't count as players or presence.
- `components/wheel/Wheel.tsx`: canvas wheel. While animating it draws from the `spin.wheel_entry_ids` snapshot (the server's remove-winner update can arrive before the animation ends). A spin received more than 1.5 s after `started_at` jumps to its final position, and a `setTimeout` backs up `requestAnimationFrame` so spins finish in background/headless tabs. Deduped by `spin_id` (the WS `spin_started` usually beats the HTTP 202). StrictMode is intentionally off.
- `admin/webApp.ts`: makes the controller a Home Screen web app ("LDYF Controller"). Its manifest and icons are in `public/admin/` and its tags are added only by the admin code, never in `index.html` (that would reveal the controller to every visitor).
- `admin/`: the whole controller, loaded only via `lazy(() => import("./admin/AdminApp"))` in `App.tsx`, mounted at `/admin/*` with relative nested routes. Never import from `src/admin` elsewhere, and never put admin paths in `src/lib`; the main bundle must not contain `/api/admin` or `/ws/admin`.
- Page titles: `Wheel · Luck Decides Your Fate` on every game page (public and admin-link alike), `Luck Decides Your Fate` everywhere else. Nothing in the friend UI may hint at rigging. The UI never re-implements name matching (the admin highlights X via the server's `rule_status.matched_entry_ids`, and click-to-target uses `rule_status.targets`, which lists every target with the entries the server matched to it).
- Design ("Blend"): colours are tokens in `index.css` (use `bg-bg`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-border`, `bg-primary` and so on; don't add `dark:` variants, the tokens switch themselves), with no stray hex values in components. Shared button styles are in `components/game/buttons.ts`. Fredoka (`font-display`) is for titles, the Spin button and slice labels; Inter is for everything else. Both are self-hosted, so the site makes no third-party font requests. The default slice colours live in `backend/app/db/ids.py`, mirrored in `frontend/src/lib/palette.ts`.
- Exact accessible names and `data-testid`s (e.g. "Spin the wheel", `winner-name`, `rule-status`, `link-status`, `live-games-count`) are relied on by E2E browser tests; keep them stable.

**Extensibility:** `game_type` (always `"wheel"` today) and the `mode` enum exist so that new games (a new animation on the same "outcome first" contract) and new rule types can be added without changing the spin flow.


## Production

- Railway behind Cloudflare (runbook: `docs/deployment.md`). **1 replica, 1 Uvicorn worker, always**: sockets, spin locks, the in-memory copy of admin sessions and the login rate limiter are in memory.
- The database lives on a Railway volume at `/data`. The image runs as non-root; Railway needs `RAILWAY_RUN_UID=0` because its volumes are owned by root.
- Merging to `main` deploys. A deploy restarts the container: sockets get close code 1012 and reconnect. The admin stays logged in.
- Never commit secrets. `ADMIN_PASSWORD` is only ever set in the environment.
- Never run the smoke scripts against production.
- CI (`.github/workflows/ci.yml`) runs on PRs and pushes to `main`: `backend` (pytest), `frontend` (typecheck, test, build), then `docker-smoke` (builds the image and runs both smoke scripts against the container). It needs no repository secrets.
- `/admin` must stay out of `robots.txt`, since that file is public. The admin area uses an `X-Robots-Tag` header instead (`app/middleware.py`).
- API additions since v1 are listed in `docs/api-changes-v1.1.md`.

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