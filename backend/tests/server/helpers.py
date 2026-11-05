"""Shared helpers for server tests (fixtures live in conftest.py)."""
import time
from pathlib import Path

from app.config import Settings

PASSWORD = "testpass"
SPIN_WAIT_S = 0.08 + 0.3 + 0.25  # max duration + server grace + slack

FORBIDDEN_KEYS = {
    "mode", "target_names", "label", "origin", "rule_status", "rule_applied",
    "matched_target", "matched_entry_ids",
}


def make_settings(tmp_path: Path, **overrides) -> Settings:
    base = dict(
        admin_password=PASSWORD,
        database_path=str(tmp_path / "test.db"),
        game_ttl_days=7,
        cookie_secure=False,
        spin_duration_ms_min=50,
        spin_duration_ms_max=80,
        frontend_dist=str(tmp_path / "no-dist"),
    )
    base.update(overrides)
    return Settings(**base)



def wait_spin():
    time.sleep(SPIN_WAIT_S)


def keys_deep(obj, acc=None):
    acc = set() if acc is None else acc
    if isinstance(obj, dict):
        acc |= set(obj.keys())
        for v in obj.values():
            keys_deep(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            keys_deep(v, acc)
    return acc


def assert_no_leak(obj):
    leaked = keys_deep(obj) & FORBIDDEN_KEYS
    assert not leaked, f"rig info leaked: {leaked}"


def new_game(client, names=None):
    r = client.post("/api/games")
    assert r.status_code == 201
    gid = r.json()["id"]
    if names:
        r = client.post(f"/api/games/{gid}/entries", json={"names": names})
        assert r.status_code == 200, r.text
    return gid


def new_link(admin, names_client=None, names=None, **body):
    r = admin.post("/api/admin/links", json=body)
    assert r.status_code == 201, r.text
    gid = r.json()["game"]["id"]
    if names:
        r = (names_client or admin).post(f"/api/games/{gid}/entries", json={"names": names})
        assert r.status_code == 200, r.text
    return gid
