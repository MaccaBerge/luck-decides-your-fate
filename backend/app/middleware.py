"""Headers added to every HTTP response (pure ASGI, so WebSockets pass straight through)."""
from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def _is_admin_path(path: str) -> bool:
    return (
        path == "/admin"
        or path.startswith("/admin/")
        or path == "/api/admin"
        or path.startswith("/api/admin/")
    )


def _cache_control(path: str, status: int, content_type: str) -> str | None:
    if path.startswith("/assets/"):
        # Filenames are hashed, so found files never change. A miss must not stick around.
        return "public, max-age=31536000, immutable" if status in (200, 304) else "no-store"
    if path == "/api" or path.startswith("/api/"):
        return "no-store"
    if content_type.startswith("text/html"):
        return "no-cache"  # index.html: new deploys must reach users immediately
    return None


def apply_response_headers(headers: MutableHeaders, path: str, status: int, *, secure: bool) -> None:
    headers["X-Content-Type-Options"] = "nosniff"
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    headers["X-Frame-Options"] = "DENY"
    if secure:
        headers["Strict-Transport-Security"] = "max-age=31536000"
    cache_control = _cache_control(path, status, headers.get("content-type", ""))
    if cache_control is not None:
        headers["Cache-Control"] = cache_control
    if _is_admin_path(path):
        headers["X-Robots-Tag"] = "noindex, nofollow"


class ResponseHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, secure: bool) -> None:
        self.app = app
        self.secure = secure

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope["path"]

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                apply_response_headers(headers, path, message["status"], secure=self.secure)
            await send(message)

        await self.app(scope, receive, send_with_headers)
