"""Find the real client IP behind Railway and (optionally) Cloudflare."""
from __future__ import annotations

from starlette.requests import HTTPConnection


def get_client_ip(conn: HTTPConnection) -> str:
    """Return the client IP: CF-Connecting-IP, then the first X-Forwarded-For entry, then the peer.

    These headers can be spoofed when the app is reached without a proxy in front that overwrites
    them, for example directly on the Railway URL or while Cloudflare is DNS-only. Someone doing
    that could get around the login rate limit. That's acceptable for this app: the long admin
    password is the real protection, and the limit only slows down casual guessing.
    """
    cf_ip = conn.headers.get("cf-connecting-ip", "").strip()
    if cf_ip:
        return cf_ip
    first_forwarded = conn.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if first_forwarded:
        return first_forwarded
    return conn.client.host if conn.client else "unknown"
