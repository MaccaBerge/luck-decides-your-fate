"""Cleanup, startup config, static serving."""
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.cleanup import run_cleanup_once

from .helpers import make_settings, new_game, new_link

BACKEND = Path(__file__).resolve().parents[2]


def backdate(db_path, game_id, iso="2000-01-01T00:00:00.000Z"):
    con = sqlite3.connect(db_path)
    con.execute("UPDATE games SET last_activity_at = ? WHERE id = ?", (iso, game_id))
    con.commit()
    con.close()


def test_cleanup_deletes_only_idle_public_games(app, client, admin):
    db = app.state.ctx.settings.database_path
    old_pub = new_game(client, ["A", "B"])
    fresh_pub = new_game(client)
    old_link = new_link(admin, label="keep me")
    backdate(db, old_pub)
    backdate(db, old_link)
    with client.websocket_connect(f"/ws/games/{old_pub}") as p:
        p.receive_json()
        backdate(db, old_pub)  # connecting touched it
        deleted = client.portal.call(run_cleanup_once, app.state.ctx)
        assert deleted == [old_pub]
        assert p.receive_json() == {"type": "game_deleted"}
    assert client.get(f"/api/games/{old_pub}").status_code == 404
    assert client.get(f"/api/games/{fresh_pub}").status_code == 200
    assert admin.get(f"/api/admin/links/{old_link}").status_code == 200


def test_missing_admin_password_exits_with_message(tmp_path):
    env = {k: v for k, v in os.environ.items() if k != "ADMIN_PASSWORD"}
    env["ADMIN_PASSWORD"] = ""
    # an empty (but set) env var also wins over any backend/.env (override=False)
    r = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=BACKEND, env={**env, "PYTHONPATH": str(BACKEND)}, capture_output=True, text=True,
    )
    assert r.returncode == 1
    assert "ADMIN_PASSWORD" in r.stderr
    assert "Traceback" not in r.stderr


def test_static_serving_and_spa_fallback(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Luck Decides Your Fate</title>")
    (dist / "assets" / "index-abc.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text("<svg/>")
    app = create_app(make_settings(tmp_path, frontend_dist=str(dist)), run_cleanup=False)
    with TestClient(app) as c:
        for path in ("/", "/g/abcdefgh", "/admin", "/admin/links/abcdefgh", "/nope/deep"):
            r = c.get(path)
            assert r.status_code == 200 and "Luck Decides Your Fate" in r.text, path
        assert c.get("/assets/index-abc.js").text == "console.log(1)"
        assert c.get("/assets/missing.js").status_code == 404
        assert c.get("/favicon.svg").text == "<svg/>"
        assert c.get("/../../etc/passwd").status_code in (200, 404)
        assert "root:" not in c.get("/../../etc/passwd").text
        # API keeps precedence and the JSON envelope
        assert c.get("/api/health").json() == {"status": "ok"}
        r = c.get("/api/nope")
        assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
        r = c.get("/api/games/zzzzzzzz")
        assert r.json()["error"]["code"] == "game_not_found"
        gid = c.post("/api/games").json()["id"]
        r = c.get(f"/api/games/{gid}/")
        assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
        assert c.post("/g/abcdefgh").status_code == 405 or c.post("/g/abcdefgh").status_code == 404
