import os
import tempfile
from pathlib import Path

# Must be set before app.main is imported anywhere (it builds a default app at import time).
os.environ.setdefault("ADMIN_PASSWORD", "testpass")
os.environ.setdefault("DATABASE_PATH", str(Path(tempfile.gettempdir()) / "rigged-wheel-import.db"))
os.environ["SPIN_DURATION_MS_MIN"] = "50"
os.environ["SPIN_DURATION_MS_MAX"] = "80"
os.environ["FRONTEND_DIST"] = str(Path(tempfile.gettempdir()) / "rigged-wheel-no-dist")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402

from .helpers import PASSWORD, make_settings  # noqa: E402


@pytest.fixture
def app(tmp_path):
    return create_app(make_settings(tmp_path), run_cleanup=False)


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


class AdminClient:
    """Same TestClient (same event loop) but every call carries the admin session cookie."""

    def __init__(self, client: TestClient, token: str) -> None:
        self.client = client
        self.token = token

    def _h(self, kw):
        headers = dict(kw.pop("headers", None) or {})
        headers["Cookie"] = f"admin_session={self.token}"
        kw["headers"] = headers
        return kw

    def get(self, url, **kw):
        return self.client.get(url, **self._h(kw))

    def post(self, url, **kw):
        return self.client.post(url, **self._h(kw))

    def patch(self, url, **kw):
        return self.client.patch(url, **self._h(kw))

    def delete(self, url, **kw):
        return self.client.delete(url, **self._h(kw))

    def websocket_connect(self, url, **kw):
        return self.client.websocket_connect(url, **self._h(kw))


def login_token(client: TestClient) -> str:
    r = client.post("/api/admin/login", json={"password": PASSWORD})
    assert r.status_code == 200, r.text
    token = r.cookies.get("admin_session")
    assert token
    client.cookies.clear()  # keep the plain client anonymous
    return token


@pytest.fixture
def admin(client):
    """Admin view of the same app/event loop as `client`."""
    return AdminClient(client, login_token(client))
