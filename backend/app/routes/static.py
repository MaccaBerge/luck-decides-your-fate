"""Serve the built frontend (frontend/dist) with an SPA fallback.

- `/assets/*` is a StaticFiles mount (registered after all API/WS routes).
- Any other GET/HEAD that matches no route and does not start with /api or /ws is answered from
  the 404 handler (app.errors): a top-level file in dist (favicon etc.) if it exists, otherwise
  index.html. Unknown /api/* and /ws/* paths keep the JSON 404 envelope.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import FileResponse, Response

from app.config import BACKEND_DIR


def resolve_dist(frontend_dist: str) -> Path | None:
    path = Path(frontend_dist)
    if not path.is_absolute():
        # Relative paths are resolved against backend/ (where uvicorn is started), not the CWD.
        path = (BACKEND_DIR / path).resolve()
    return path if (path / "index.html").is_file() else None


def mount_static(app: FastAPI, frontend_dist: str) -> None:
    dist = resolve_dist(frontend_dist)
    app.state.frontend_dist = dist
    if dist is None:
        return
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")


def _is_api_path(path: str) -> bool:
    return path in ("/api", "/ws") or path.startswith("/api/") or path.startswith("/ws/")


def spa_fallback(request: Request) -> Response | None:
    dist: Path | None = getattr(request.app.state, "frontend_dist", None)
    if dist is None or request.method not in ("GET", "HEAD"):
        return None
    path = request.url.path
    if _is_api_path(path) or path.startswith("/assets/"):
        return None
    rel = path.lstrip("/")
    if rel:
        candidate = (dist / rel).resolve()
        if candidate.is_file() and candidate.is_relative_to(dist.resolve()):
            return FileResponse(candidate)
    return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})
