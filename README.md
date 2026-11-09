# Luck Decides Your Fate

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

One command starts the backend (:8000) and the frontend (:5173), both reloading when you change code, and stops both with Ctrl+C:

```bash
./dev.sh
```

Open http://localhost:5173 for the wheel and http://localhost:5173/admin for the controller (password `devpass`, or whatever `ADMIN_PASSWORD` is set to in your shell; it overrides `backend/.env`). The data lives in `backend/data/dev.db`.

| Option | What it does |
|---|---|
| `--fresh` | Deletes the dev database first. |
| `--seed` | Adds test data through the API: a wheel with a few spins, a link rigged to "always Jonas" with a few spins, and a fair link nobody has opened. It prints their URLs. |
| `--fast` | Spins take about 1 second instead of 4.5–7. |
| `--phone` | Also serves the site on your Wi-Fi and prints an address like `http://192.168.1.23:5173` for your phone (same network). |

For example, a clean slate with test data and quick spins:

```bash
./dev.sh --fresh --seed --fast
```

Notes:
- Dev data is never backed up: the script turns backups off even if `backend/.env` has backup settings.
- To run a second copy next to the first, change the ports: `DEV_BACKEND_PORT=8010 DEV_FRONTEND_PORT=5174 ./dev.sh`. The frontend's proxy follows `DEV_BACKEND_PORT`.
- If a port is already in use, the script says so and stops; it never stops other processes.
- In the Claude desktop app, `.claude/launch.json` offers the same two setups ("dev", and "dev (fresh test data, fast spins)") to start from the Code tab.

Starting the two servers by hand still works:

```bash
# 1) backend on :8000 (always a single worker: live state is kept in memory)
cd backend
ADMIN_PASSWORD=devpass DATABASE_PATH=./data/dev.db .venv/bin/uvicorn app.main:app --port 8000 --workers 1 --reload

# 2) frontend on :5173 (proxies /api and /ws to :8000)
cd frontend
npm run dev
```

### What to click through

A quick pass over every feature, with `./dev.sh --fresh --seed --fast` (add `--phone` to try it on your phone too):

- **Solo wheel:** add, paste, hide, delete and shuffle names; spin; "Remove winner after spin"; Recent spins; saved lists; QR code; big-screen mode (enter mid-spin, Escape with and without the result dialog).
- **Two tabs on one wheel:** a spin or a name change in one shows up live in the other. Hide one tab for over 15 seconds, change something, and come back.
- **Controller:** log in at `/admin`; open the seeded rigged link; change the mode; click names and slices to set targets (they sort to the front, numbered); spin from the link's wheel and check the result and the spin history.
- **Analytics:** `/admin/analytics`, in 7, 30 and 90 days.
- **Friends' wheels:** under Friends on the dashboard, add a few friends and set the standing rule. Make a wheel at `/` with two of them on it: it shows up under "Friends' wheels" and follows the standing rule. Open its controls, change the rule (it gets its own), then "Back to the standing rule".
- **Controller on a phone:** with `./dev.sh --phone`, open `/admin` in Safari on the iPhone, then Share → Add to Home Screen. It's added as "LDYF Controller" and opens full screen. Log in once inside it (a Home Screen app keeps its own cookies, separate from Safari). The dashboard's "Signed-in devices" card lists every login and can sign them out.
- **Light and dark:** the theme button, on the wheel and in the controller.

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
docker build -t luck-decides-your-fate .
docker run -p 8000:8000 -e ADMIN_PASSWORD=change-me -v wheel-data:/data luck-decides-your-fate
```

The image runs as a non-root user and stores the database at `/data/luckdecidesyourfate.db`. See
[Deployment](#deployment) for production.

## Environment variables

Real environment variables take precedence over `backend/.env`.

| Var | Default | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | (none) | **Required.** The app exits at startup with a clear message if it is missing, and logs a warning if it is shorter than 16 characters. |
| `DATABASE_PATH` | `./data/luckdecidesyourfate.db` | SQLite file. Its parent directory is created automatically. |
| `GAME_TTL_DAYS` | `7` | Public games idle this long are deleted (checked hourly). Admin links are never deleted automatically. |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | (unset) | Automatic backups to a private S3-compatible bucket. All four turn them on, none leaves them off, and only some stops startup. See `docs/deployment.md`. |
| `BACKUP_INTERVAL_HOURS` | `24` | Back up when the newest copy is at least this old (checked hourly). |
| `BACKUP_KEEP` | `14` | How many copies to keep. Older ones are deleted after a successful upload. |
| `COOKIE_SECURE` | `false` | `true/false/1/0/yes/no`; anything else stops startup. `true` adds `Secure` to the admin cookie and sends HSTS. |
| `SPIN_DURATION_MS_MIN` | `4500` | Spin animation length range. |
| `SPIN_DURATION_MS_MAX` | `7000` | |
| `FRONTEND_DIST` | `../frontend/dist` | Relative paths are resolved against `backend/`. Served if it contains `index.html`. The Dockerfile sets this. |
| `LOGIN_RATE_LIMIT_ATTEMPTS` | `5` | Failed admin logins per client IP before it gets a 429. |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `60` | Length of the failed-login window. |

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

## Deployment

Production runs on Railway behind Cloudflare. **[docs/deployment.md](docs/deployment.md)** is the
step-by-step runbook.

```
luckdecideyourfate.com ─┐
www.luckdecideyourfate.com ─┼─ Cloudflare 301 redirect (keeps path + query) ─┐
www.luckdecidesyourfate.com ─┘                                               ▼
                                     luckdecidesyourfate.com ──HTTPS──► Cloudflare DNS ──► Railway
                                                                                     │
                                                                  one Docker container (1 replica)
                                                                  FastAPI + built React frontend
                                                                                     │
                                                                  Railway volume mounted at /data
                                                                  (/data/luckdecidesyourfate.db)
```

**Always run exactly 1 replica with 1 Uvicorn worker.** Live sockets, spin locks and the login
rate limiter live in memory, and so does a copy of the admin sessions. Every redeploy restarts the
container: sockets reconnect by themselves. The admin stays logged in, because sessions are also
stored in the database.

Production variables (see [Environment variables](#environment-variables) for all of them):

| Var | Value |
|---|---|
| `ADMIN_PASSWORD` | long random string |
| `COOKIE_SECURE` | `true` |
| `DATABASE_PATH` | `/data/luckdecidesyourfate.db` |
| `GAME_TTL_DAYS` | `7` |
| `RAILWAY_RUN_UID` | `0` (Railway only: its volumes are owned by root) |

Don't set `SPIN_DURATION_*` or `PORT` in production. Railway provides `PORT`.

### Build and run the image locally

```bash
docker build -t luck-decides-your-fate .
mkdir -p test-artifacts/dockerdata
docker run -d --name ldyf -p 8000:8000 \
  -e PORT=8000 -e ADMIN_PASSWORD=testpass \
  -e SPIN_DURATION_MS_MIN=300 -e SPIN_DURATION_MS_MAX=400 \
  -e DATABASE_PATH=/data/test.db -v "$(pwd)/test-artifacts/dockerdata:/data" \
  luck-decides-your-fate
```

### Smoke test the container

Use the short spin durations above and a fresh database, because the scripts check exact counts.
Never run these against production: they expect short spins and leave test data behind.

```bash
cd backend
BASE=http://localhost:8000 bash scripts/smoke_api.sh
BASE=http://localhost:8000 ADMIN_PASSWORD=testpass .venv/bin/python scripts/smoke_realtime.py
docker rm -f ldyf
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
  `GET|PATCH|DELETE /api/admin/links/{id}`, `GET /api/admin/sessions`,
  `DELETE /api/admin/sessions/{id}`, `POST /api/admin/sessions/sign-out-others`.
- Sockets: `/ws/games/{id}` (players), `/ws/admin` (dashboard), `/ws/admin/games/{id}` (link
  control). A rejected connection is accepted and then closed with code 4401 or 4404.

Public responses and player socket messages never contain rig information (mode, targets,
label, origin or rule status). `app/services/serializers.py` is the only place that builds them.
