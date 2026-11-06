"""R7: robots.txt, and noindex on the admin area and wheel pages."""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app

from .helpers import make_dist, make_settings


@pytest.fixture
def spa(tmp_path):
    app = create_app(make_settings(tmp_path, frontend_dist=str(make_dist(tmp_path))), run_cleanup=False)
    with TestClient(app) as c:
        yield c


def test_robots_content_and_type(spa):
    r = spa.get("/robots.txt")
    assert r.status_code == 200
    assert r.text == "User-agent: *\nAllow: /\n"
    assert r.headers["content-type"].startswith("text/plain")


def test_robots_does_not_mention_admin(spa):
    assert "admin" not in spa.get("/robots.txt").text.lower()


def test_robots_does_not_block_wheels(spa):
    text = spa.get("/robots.txt").text
    assert "/g/" not in text
    assert "Disallow" not in text


def test_robots_works_without_a_built_frontend(client):
    assert client.get("/robots.txt").status_code == 200


@pytest.mark.parametrize("path", ["/admin", "/admin/", "/admin/links/abcdefgh"])
def test_noindex_on_admin_pages(spa, path):
    r = spa.get(path)
    assert r.status_code == 200
    assert r.headers["x-robots-tag"] == "noindex, nofollow"


@pytest.mark.parametrize("path", ["/api/admin/me", "/api/admin/dashboard", "/api/admin/backup"])
def test_noindex_on_admin_api(spa, path):
    assert spa.get(path).headers["x-robots-tag"] == "noindex, nofollow"


def test_noindex_on_login_responses(spa):
    r = spa.post("/api/admin/login", json={"password": "wrong"})
    assert r.headers["x-robots-tag"] == "noindex, nofollow"


@pytest.mark.parametrize("method", ["get", "head"])
def test_noindex_on_wheel_pages(spa, method):
    gid = spa.post("/api/games").json()["id"]
    r = getattr(spa, method)(f"/g/{gid}")
    assert r.status_code == 200
    assert r.headers["x-robots-tag"] == "noindex, nofollow"


def test_no_noindex_elsewhere(spa):
    gid = spa.post("/api/games").json()["id"]
    for path in ("/", "/robots.txt", "/assets/index-abc.js", "/api/health",
                 f"/api/games/{gid}", "/administrator", "/g", "/game"):
        assert "x-robots-tag" not in spa.get(path).headers, path
