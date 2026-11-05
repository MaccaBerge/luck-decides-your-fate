# syntax=docker/dockerfile:1

# ---------- 1) build the frontend ----------
FROM node:lts-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- 2) python runtime ----------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/data/luckdecidesyourfate.db \
    FRONTEND_DIST=/app/frontend/dist
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# Non-root user that owns /data. Railway mounts its volumes as root, so the runbook sets
# RAILWAY_RUN_UID=0 there (docs/deployment.md).
RUN useradd --system --create-home --uid 10001 app \
    && mkdir -p /data \
    && chown app:app /data
USER app

EXPOSE 8000
# ADMIN_PASSWORD must be provided at runtime (the app exits with a clear message otherwise).
# Single worker: live state (sockets, spin locks, admin sessions, rate limiter) is in memory.
# Shell form so that PORT expands; `exec` so that uvicorn replaces the shell as PID 1 and receives
# SIGTERM. Without it the shell swallows the signal and the container gets killed mid-shutdown.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 \
    --proxy-headers --forwarded-allow-ips="*"
