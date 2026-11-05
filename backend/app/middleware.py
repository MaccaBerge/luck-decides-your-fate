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


def apply_response_headers(headers: MutableHeaders, path: str) -> None:
    if _is_admin_path(path):
        headers["X-Robots-Tag"] = "noindex, nofollow"


class ResponseHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope["path"]

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                apply_response_headers(MutableHeaders(scope=message), path)
            await send(message)

        await self.app(scope, receive, send_with_headers)
