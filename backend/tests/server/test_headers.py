"""R8: security and caching headers."""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app

from .helpers import make_dist, make_settings


def spa_client(tmp_path, **settings):
    return TestClient(
        create_app(
            make_settings(tmp_path, frontend_dist=str(make_dist(tmp_path)), **settings),
            run_cleanup=False,
        ),
        raise_server_exceptions=False,
    )


@pytest.fixture
def spa(tmp_path):
    with spa_client(tmp_path) as c:
        yield c


@pytest.mark.parametrize(
    "path", ["/", "/g/abcdefgh", "/admin", "/robots.txt", "/assets/index-abc.js", "/api/health",
             "/api/nope", "/api/games/zzzzzzzz", "/assets/missing.js"],
)
def test_security_headers_on_every_response(spa, path):
    h = spa.get(path).headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["referrer-policy"] == "strict-origin-when-cross-origin"
    assert h["x-frame-options"] == "DENY"


def test_no_csp(spa):
    assert "content-security-policy" not in spa.get("/").headers


def test_hsts_off_by_default(spa):
    assert "strict-transport-security" not in spa.get("/").headers


def test_hsts_on_when_cookie_secure(tmp_path):
    with spa_client(tmp_path, cookie_secure=True) as c:
        for path in ("/", "/api/health", "/assets/index-abc.js"):
            assert c.get(path).headers["strict-transport-security"] == "max-age=31536000", path


def test_assets_are_immutable(spa):
    r = spa.get("/assets/index-abc.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_missing_asset_is_not_cached(spa):
    r = spa.get("/assets/missing.js")
    assert r.status_code == 404
    assert r.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("path", ["/", "/g/abcdefgh", "/admin", "/admin/links/abcdefgh"])
def test_index_html_is_no_cache(spa, path):
    r = spa.get(path)
    assert r.headers["content-type"].startswith("text/html")
    assert r.headers["cache-control"] == "no-cache"


def test_head_on_index_has_the_headers(spa):
    r = spa.head("/")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache"
    assert r.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize("path", ["/api/health", "/api/nope", "/api/admin/me"])
def test_api_is_no_store(spa, path):
    assert spa.get(path).headers["cache-control"] == "no-store"


def test_unhandled_errors_also_get_the_headers(tmp_path):
    with spa_client(tmp_path) as c:
        async def boom():
            raise RuntimeError("boom")

        c.app.router.add_route("/api/boom", boom)
        r = c.get("/api/boom")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal_error"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["cache-control"] == "no-store"
