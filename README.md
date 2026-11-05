# Spin the Wheel

A spin-the-wheel name picker (React + TypeScript frontend, FastAPI backend, SQLite) with a
private admin controller at `/admin`.

- `/` creates a fresh wheel with its own shareable URL `/g/{id}`. Everyone on the same URL sees
  the same live wheel.
- The **server** picks every winner and then broadcasts it with random animation parameters.
  Clients only animate.
- Links created from `/admin` look exactly like normal wheels. The admin can set a rule
  (fair / always X / never X, using an ordered list of target names) and change it at any time,
  and can watch status, names, spins and results live.

## Layout

```
backend/    FastAPI app (app/), tests (tests/core, tests/server), smoke scripts (scripts/)
frontend/   Vite + React + Tailwind app (admin UI lazy-loaded from src/admin)
Dockerfile  single-service image (builds the frontend, serves it from FastAPI)
```

## Local setup

Requirements: Python 3.11+ (3.12 recommended), Node 20+, `jq` and `curl` (for the API smoke test).

```bash
# backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env          # then set ADMIN_PASSWORD

# frontend
cd ../frontend
npm install
```

## Running in development

Two terminals:

```bash
# 1) backend on :8000 (always a single worker: live state is kept in memory)
cd backend
ADMIN_PASSWORD=devpass DATABASE_PATH=./data/dev.db .venv/bin/uvicorn app.main:app --port 8000 --workers 1 --reload

# 2) frontend on :5173 (proxies /api and /ws to :8000)
cd frontend
npm run dev
```

Open http://localhost:5173 for the wheel and http://localhost:5173/admin for the controller.

## Production-style run (single service)

```bash
cd frontend && npm run build          # -> frontend/dist
cd ../backend
ADMIN_PASSWORD=... .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

FastAPI serves `frontend/dist` when it exists: `/assets/*` directly, top-level files such as
the favicon, and `index.html` for every other non-API GET (SPA fallback). Unknown `/api/*`
paths still return the JSON error envelope.

### Docker

```bash
docker build -t spin-the-wheel .
docker run -p 8000:8000 -e ADMIN_PASSWORD=change-me -v wheel-data:/data spin-the-wheel
```

The image stores the database at `/data/app.db`. Mount a volume there (for example a Railway or
Fly.io volume). The container listens on `$PORT` (default 8000). Set `COOKIE_SECURE=true` when the
site is served over HTTPS. Always run **one** worker and one instance: WebSocket presence, spin
locks and admin sessions live in process memory.

## Environment variables

Real environment variables take precedence over `backend/.env`.

| Var | Default | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | (none) | **Required.** The app exits at startup with a clear message if it is missing. |
| `DATABASE_PATH` | `./data/app.db` | SQLite file. Its parent directory is created automatically. |
| `GAME_TTL_DAYS` | `7` | Public games idle this long are deleted (checked hourly). Admin links are never deleted automatically. |
| `COOKIE_SECURE` | `false` | `true` adds `Secure` to the admin cookie (HTTPS). |
| `SPIN_DURATION_MS_MIN` | `4500` | Spin animation length range. |
| `SPIN_DURATION_MS_MAX` | `7000` | |
| `FRONTEND_DIST` | `../frontend/dist` | Relative paths are resolved against `backend/`. Served if it contains `index.html`. |

## Validation

### Backend tests

```bash
cd backend
.venv/bin/python -m pytest -q                 # everything
.venv/bin/python -m pytest tests/core -q      # db + engine
.venv/bin/python -m pytest tests/server -q    # REST, WebSockets, auth, secrecy, cleanup, static
```

### Smoke tests against a running server

```bash
cd backend
rm -f data/smoke.db
ADMIN_PASSWORD=testpass SPIN_DURATION_MS_MIN=300 SPIN_DURATION_MS_MAX=400 \
  DATABASE_PATH=./data/smoke.db .venv/bin/uvicorn app.main:app --port 8100 --workers 1 &
sleep 3
BASE=http://localhost:8100 bash scripts/smoke_api.sh
BASE=http://localhost:8100 ADMIN_PASSWORD=testpass .venv/bin/python scripts/smoke_realtime.py
```

Each script ends with `ALL ... SMOKE CHECKS PASSED`. Start from a fresh database, because the
API script checks exact spin-history counts.

### Frontend

```bash
cd frontend
npm run typecheck && npm run test && npm run build
! grep -l "/api/admin" dist/assets/index-*.js && echo "admin code is lazy-loaded"
```

### Route list (for contract diffs)

```bash
cd backend
ADMIN_PASSWORD=x .venv/bin/python -c "from app.main import app; [print(sorted(getattr(r, 'methods', None) or ['WS']), r.path) for r in app.routes]"
```

## API overview

All mutations go through REST. All live updates are pushed over WebSockets, from server to
client only. URLs never end in a trailing slash (`/api/games/x/` returns 404). Every error has
the form `{"error": {"code": "...", "message": "..."}}`.

- Public: `POST /api/games`, `GET /api/games/{id}`, `POST /api/games/{id}/entries`,
  `PATCH|DELETE /api/games/{id}/entries/{entry_id}`, `POST /api/games/{id}/shuffle`,
  `POST /api/games/{id}/restore`, `PATCH /api/games/{id}/settings`, `POST /api/games/{id}/spin`.
- Admin (cookie `admin_session`): `POST /api/admin/login`, `POST /api/admin/logout`,
  `GET /api/admin/me`, `GET /api/admin/dashboard`, `POST /api/admin/links`,
  `GET|PATCH|DELETE /api/admin/links/{id}`.
- Sockets: `/ws/games/{id}` (players), `/ws/admin` (dashboard), `/ws/admin/games/{id}` (link
  control). A rejected connection is accepted and then closed with code 4401 or 4404.

Public responses and player socket messages never contain rig information (mode, targets,
label, origin or rule status). `app/services/serializers.py` is the only place that builds them.
