"""R11: admin database backup."""
import glob
import os
import re
import sqlite3
import tempfile

from .helpers import new_link


def test_requires_auth(client):
    r = client.get("/api/admin/backup")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_downloads_a_valid_sqlite_file(client, admin, tmp_path):
    gid = new_link(admin, client, ["Anna", "Per"], label="Party", mode="always", target_names=["Anna"])
    r = admin.get("/api/admin/backup")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/vnd.sqlite3"
    assert re.fullmatch(
        r'attachment; filename="luckdecidesyourfate-\d{8}-\d{6}\.db"',
        r.headers["content-disposition"],
    )
    assert r.headers["cache-control"] == "no-store"

    path = tmp_path / "download.db"
    path.write_bytes(r.content)
    con = sqlite3.connect(path)
    try:
        assert con.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"games", "entries", "spins"} <= tables
        assert con.execute("SELECT label FROM games WHERE id = ?", (gid,)).fetchone() == ("Party",)
        assert con.execute("SELECT count(*) FROM entries").fetchone() == (2,)
    finally:
        con.close()


def test_temp_file_is_deleted(admin):
    pattern = os.path.join(tempfile.gettempdir(), "ldyf-backup-*")
    before = set(glob.glob(pattern))
    assert admin.get("/api/admin/backup").status_code == 200
    assert set(glob.glob(pattern)) == before


def test_not_linked_from_public_state(client):
    gid = client.post("/api/games").json()["id"]
    assert "backup" not in client.get(f"/api/games/{gid}").text
