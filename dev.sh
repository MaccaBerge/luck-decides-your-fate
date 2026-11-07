#!/usr/bin/env bash
# Local test environment: the backend (FastAPI) and the frontend (Vite), both with auto-reload,
# started together and stopped together with one Ctrl+C. See "Local testing" in README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
# Ports can be changed, e.g. to run a second copy: DEV_BACKEND_PORT=8010 DEV_FRONTEND_PORT=5174 ./dev.sh
BACKEND_PORT="${DEV_BACKEND_PORT:-8000}"
FRONTEND_PORT="${DEV_FRONTEND_PORT:-5173}"
SEED_PORT="${DEV_SEED_PORT:-8099}"   # a short-lived backend that only exists while seeding
export DEV_BACKEND_PORT="$BACKEND_PORT"  # vite.config.ts proxies /api and /ws to this port
DB_REL="./data/dev.db"
PASSWORD="${ADMIN_PASSWORD:-devpass}"

usage() {
  cat <<'EOF'
Usage: ./dev.sh [options]

Starts the backend on :8000 and the frontend on :5173 (open http://localhost:5173).
The controller is at /admin, password "devpass" (or $ADMIN_PASSWORD). Ctrl+C stops both.

  --fresh   delete the dev database (backend/data/dev.db) first
  --seed    add test data: a wheel with spins, a rigged link with spins, a fair link
  --fast    spins take about 1 second instead of 4.5-7
  --phone   also serve on your Wi-Fi, so you can open it on your phone
  -h        show this help

Example: ./dev.sh --fresh --seed --fast
EOF
}

fresh=0 seed=0 fast=0 phone=0
for arg in "$@"; do
  case "$arg" in
    --fresh) fresh=1 ;;
    --seed) seed=1 ;;
    --fast) fast=1 ;;
    --phone) phone=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------- checks
if [[ ! -x "$BACKEND/.venv/bin/uvicorn" ]]; then
  echo "The backend isn't set up yet. Run:" >&2
  echo "  cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt" >&2
  exit 1
fi
if [[ ! -x "$FRONTEND/node_modules/.bin/vite" ]]; then
  echo "The frontend isn't set up yet. Run:  cd frontend && npm install" >&2
  exit 1
fi
port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }
ports=("$BACKEND_PORT" "$FRONTEND_PORT")
[[ $seed == 1 ]] && ports+=("$SEED_PORT")
for p in "${ports[@]}"; do
  if port_busy "$p"; then
    echo "Port $p is already in use (another dev server?). Stop it first." >&2
    exit 1
  fi
done

# Dev data is never backed up, even if backend/.env has backup settings.
export BACKUP_S3_ENDPOINT="" BACKUP_S3_BUCKET="" BACKUP_S3_ACCESS_KEY_ID="" BACKUP_S3_SECRET_ACCESS_KEY=""
export ADMIN_PASSWORD="$PASSWORD" DATABASE_PATH="$DB_REL"
if [[ $fast == 1 ]]; then
  export SPIN_DURATION_MS_MIN=800 SPIN_DURATION_MS_MAX=1200
fi

mkdir -p "$BACKEND/data"
if [[ $fresh == 1 ]]; then
  rm -f "$BACKEND/data/dev.db" "$BACKEND/data/dev.db-wal" "$BACKEND/data/dev.db-shm"
  echo "Deleted the dev database."
fi

# ---------------------------------------------------------------- process handling
pids=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]+"${pids[@]}"}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  echo
  echo "Stopped."
}
trap cleanup EXIT
trap 'exit 130' INT TERM

wait_for() {  # wait_for URL NAME
  for _ in $(seq 1 80); do
    curl -fs -o /dev/null "$1" && return 0
    sleep 0.25
  done
  echo "The $2 didn't start. Its output is above." >&2
  exit 1
}

# ---------------------------------------------------------------- seed (optional)
seed_report=""
if [[ $seed == 1 ]]; then
  echo "Adding test data…"
  # A temporary backend with quick spins, so seeding takes seconds whatever --fast says.
  (cd "$BACKEND" && SPIN_DURATION_MS_MIN=300 SPIN_DURATION_MS_MAX=400 \
    exec .venv/bin/uvicorn app.main:app --port "$SEED_PORT" --workers 1 --log-level warning) &
  seed_pid=$!
  pids+=("$seed_pid")
  wait_for "http://127.0.0.1:$SEED_PORT/api/health" "seeding backend"
  seed_report="$("$BACKEND/.venv/bin/python" "$BACKEND/scripts/seed_dev.py" \
    "http://127.0.0.1:$SEED_PORT" "http://localhost:$FRONTEND_PORT")"
  kill "$seed_pid"
  wait "$seed_pid" 2>/dev/null || true
  pids=()
fi

# ---------------------------------------------------------------- start
(cd "$BACKEND" && exec .venv/bin/uvicorn app.main:app --port "$BACKEND_PORT" --workers 1 \
  --reload --reload-dir app) &
pids+=($!)

vite_args=(--port "$FRONTEND_PORT" --strictPort)
[[ $phone == 1 ]] && vite_args+=(--host 0.0.0.0)
(cd "$FRONTEND" && exec ./node_modules/.bin/vite "${vite_args[@]}") &
pids+=($!)

wait_for "http://127.0.0.1:$BACKEND_PORT/api/health" "backend"
# "localhost", not 127.0.0.1: on macOS, Vite listens only on IPv6 (::1) unless --phone is used.
wait_for "http://localhost:$FRONTEND_PORT/" "frontend"

lan_ip=""
if [[ $phone == 1 ]]; then
  lan_ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi

cat <<EOF

────────────────────────────────────────────────────────────
 Luck Decides Your Fate is running (dev)

   Wheel        http://localhost:$FRONTEND_PORT
   Controller   http://localhost:$FRONTEND_PORT/admin    password: $PASSWORD
EOF
if [[ $phone == 1 ]]; then
  if [[ -n $lan_ip ]]; then
    echo "   Your phone   http://$lan_ip:$FRONTEND_PORT    (same Wi-Fi)"
  else
    echo "   Your phone   couldn't find this computer's Wi-Fi address; use its IP with port $FRONTEND_PORT"
  fi
fi
if [[ $fast == 1 ]]; then echo "   Spins        fast (about 1 s)"; else echo "   Spins        normal (4.5-7 s); --fast for 1 s"; fi
echo "   Database     backend/data/dev.db"
if [[ -n $seed_report ]]; then
  echo
  echo " Test data:"
  echo "$seed_report"
fi
cat <<'EOF'

 Code changes reload by themselves. Press Ctrl+C to stop both.
────────────────────────────────────────────────────────────

EOF

# Stay up until Ctrl+C, or stop if either server exits.
while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "A server stopped unexpectedly; stopping the other." >&2
      exit 1
    fi
  done
  sleep 1
done
