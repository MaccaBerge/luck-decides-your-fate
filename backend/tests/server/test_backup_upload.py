"""v1.2: automatic backups. Uses a fake store; nothing here touches a real bucket."""
import asyncio
import json
import logging
import os
import sqlite3
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import BACKUP_S3_VARS, ConfigError, config_summary, load_settings
from app.main import create_app
from app.services import backup_upload
from app.services.backup_upload import StoredBackup, run_backup_check

from .helpers import keys_deep, make_settings, new_game, new_link

SECRETS = dict(
    backup_s3_endpoint="https://endpoint-secret.example",
    backup_s3_bucket="bucket-secret",
    backup_s3_access_key_id="key-id-secret",
    backup_s3_secret_access_key="access-key-secret",
)
UTC = timezone.utc
NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)


def key_for(when: datetime) -> str:
    return f"backups/luckdecidesyourfate-{when.strftime('%Y%m%d-%H%M%S')}.db"


class FakeStore:
    def __init__(self, objects=()):
        self.objects = {o.key: o for o in objects}
        self.uploads = []
        self.deleted = []
        self.fail_list = None
        self.fail_upload = None
        self.on_upload = None

    def list_objects(self):
        if self.fail_list:
            raise self.fail_list
        return list(self.objects.values())

    def upload(self, path, key):
        if self.on_upload:
            self.on_upload(path)
        if self.fail_upload:
            raise self.fail_upload
        self.uploads.append(key)
        self.objects[key] = StoredBackup(key, datetime.now(UTC))

    def delete(self, key):
        self.deleted.append(key)
        del self.objects[key]


def aged(hours, when=NOW):
    t = when - timedelta(hours=hours)
    return StoredBackup(key_for(t), t)


@pytest.fixture
def temp_dir(tmp_path, monkeypatch):
    d = tmp_path / "snapshots"
    d.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(d))
    return d


def app_with(tmp_path, store=None, **settings):
    s = make_settings(tmp_path, **{**SECRETS, **settings})
    return create_app(s, run_cleanup=False, backup_store=store)


@pytest.fixture
def idle_loop(monkeypatch):
    """Stop the background loop running its own check, so tests control every check."""

    async def nothing(*_a, **_k):
        await asyncio.Event().wait()

    monkeypatch.setattr("app.main.backup_loop", nothing)


def check(client, store, now=NOW):
    ctx = client.app.state.ctx
    return client.portal.call(run_backup_check, ctx, store, now)


# ---------------------------------------------------------------- config
@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "a-long-enough-password")
    monkeypatch.setattr("app.config.load_dotenv", lambda *a, **k: None)
    for name in (*BACKUP_S3_VARS, "BACKUP_INTERVAL_HOURS", "BACKUP_KEEP"):
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_off_by_default(env):
    s = load_settings()
    assert s.backups_enabled is False
    assert (s.backup_interval_hours, s.backup_keep) == (24, 14)
    assert config_summary(s, frontend_served=False).endswith("backups=off")


def test_all_values_turn_it_on(env):
    for name in BACKUP_S3_VARS:
        env.setenv(name, "x")
    s = load_settings()
    assert s.backups_enabled is True
    assert config_summary(s, frontend_served=False).endswith("backups=on")


@pytest.mark.parametrize("left_out", BACKUP_S3_VARS)
def test_partial_config_is_rejected(env, left_out):
    for name in BACKUP_S3_VARS:
        if name != left_out:
            env.setenv(name, "value-that-must-not-appear")
    with pytest.raises(ConfigError) as exc:
        load_settings()
    assert left_out in str(exc.value)
    assert "value-that-must-not-appear" not in str(exc.value)


@pytest.mark.parametrize("name", ["BACKUP_INTERVAL_HOURS", "BACKUP_KEEP"])
def test_interval_and_keep_must_be_positive(env, name):
    env.setenv(name, "0")
    with pytest.raises(ConfigError):
        load_settings()


def test_settings_repr_hides_the_values():
    text = repr(make_settings(Path("/tmp"), **SECRETS))
    for secret in SECRETS.values():
        assert secret not in text


def test_app_runs_with_backups_off_and_dashboard_says_so(client, admin):
    assert client.app.state.ctx.settings.backups_enabled is False
    assert admin.get("/api/admin/dashboard").json()["backup"] == {
        "enabled": False,
        "last_success_at": None,
        "last_error": None,
    }


# ---------------------------------------------------------------- when to back up
def test_backs_up_when_there_is_no_copy(tmp_path, temp_dir, idle_loop):
    store = FakeStore()
    with TestClient(app_with(tmp_path)) as c:
        assert check(c, store) is True
    assert len(store.uploads) == 1
    assert backup_upload.BACKUP_FILENAME_RE.fullmatch(store.uploads[0].removeprefix("backups/"))


def test_backs_up_when_newest_is_too_old(tmp_path, temp_dir, idle_loop):
    store = FakeStore([aged(25), aged(49)])
    with TestClient(app_with(tmp_path)) as c:
        assert check(c, store) is True
    assert len(store.uploads) == 1


def test_skips_when_newest_is_recent(tmp_path, temp_dir, idle_loop):
    store = FakeStore([aged(23), aged(49)])
    with TestClient(app_with(tmp_path)) as c:
        assert check(c, store) is False
        assert c.app.state.ctx.backup_status.last_success_at == "2026-11-05T13:00:00.000Z"
    assert store.uploads == [] and store.deleted == []


def test_interval_setting_is_respected(tmp_path, temp_dir, idle_loop):
    store = FakeStore([aged(3)])
    with TestClient(app_with(tmp_path, backup_interval_hours=2)) as c:
        assert check(c, store) is True


def test_unrelated_objects_dont_count_as_a_backup(tmp_path, temp_dir, idle_loop):
    store = FakeStore([StoredBackup("backups/notes.txt", NOW)])
    with TestClient(app_with(tmp_path)) as c:
        assert check(c, store) is True


def wait_for(pred, timeout=3.0):
    end = time.monotonic() + timeout
    while not pred():
        assert time.monotonic() < end, "never happened"
        time.sleep(0.01)


def test_restart_doesnt_cause_an_extra_backup(tmp_path, temp_dir):
    store = FakeStore()
    with TestClient(app_with(tmp_path, store=store)):
        wait_for(lambda: store.uploads)
    assert len(store.uploads) == 1
    with TestClient(app_with(tmp_path, store=store)) as c:
        # The time comes back from the bucket, because the status lives in memory.
        wait_for(lambda: c.app.state.ctx.backup_status.last_success_at is not None)
    assert len(store.uploads) == 1


# ---------------------------------------------------------------- what gets uploaded
def test_snapshot_opens_and_contains_known_data(tmp_path, temp_dir, idle_loop):
    seen = {}

    def inspect(path):
        con = sqlite3.connect(path)
        try:
            seen["integrity"] = con.execute("PRAGMA integrity_check").fetchone()
            seen["names"] = {r[0] for r in con.execute("SELECT name FROM entries")}
            seen["label"] = con.execute("SELECT label FROM games WHERE label IS NOT NULL").fetchone()
        finally:
            con.close()

    store = FakeStore()
    store.on_upload = inspect
    with TestClient(app_with(tmp_path)) as c:
        token = c.post("/api/admin/login", json={"password": "testpass"}).cookies["admin_session"]
        c.cookies.clear()
        h = {"Cookie": f"admin_session={token}"}
        gid = c.post("/api/admin/links", json={"label": "Known"}, headers=h).json()["game"]["id"]
        c.post(f"/api/games/{gid}/entries", json={"names": ["Anna", "Per"]})
        assert check(c, store) is True
    assert seen == {"integrity": ("ok",), "names": {"Anna", "Per"}, "label": ("Known",)}


def test_bad_snapshot_isnt_uploaded(tmp_path, temp_dir, idle_loop, monkeypatch):
    def bad(_path):
        raise backup_upload.SnapshotCheckFailed

    monkeypatch.setattr(backup_upload, "_check_snapshot", bad)
    store = FakeStore()
    with TestClient(app_with(tmp_path)) as c:
        assert check(c, store) is False
        assert c.app.state.ctx.backup_status.last_error == "SnapshotCheckFailed"
    assert store.uploads == []
    assert list(temp_dir.iterdir()) == []


# ---------------------------------------------------------------- temp files
def test_temp_file_removed_after_success(tmp_path, temp_dir, idle_loop):
    during = []
    store = FakeStore()
    store.on_upload = lambda path: during.append(os.path.exists(path))
    with TestClient(app_with(tmp_path)) as c:
        check(c, store)
    assert during == [True]
    assert list(temp_dir.iterdir()) == []


def test_temp_file_removed_after_failed_upload(tmp_path, temp_dir, idle_loop):
    store = FakeStore()
    store.fail_upload = OSError("nope")
    with TestClient(app_with(tmp_path)) as c:
        check(c, store)
    assert list(temp_dir.iterdir()) == []


# ---------------------------------------------------------------- failures
def test_failed_upload_deletes_nothing_and_app_keeps_running(tmp_path, temp_dir, idle_loop):
    old = [aged(30 + 24 * i) for i in range(20)]
    store = FakeStore(old)
    store.fail_upload = OSError("nope")
    with TestClient(app_with(tmp_path, backup_keep=2)) as c:
        assert check(c, store) is False
        assert store.deleted == []
        assert len(store.objects) == 20
        assert c.app.state.ctx.backup_status.last_error == "OSError"
        assert c.get("/api/health").status_code == 200
        assert new_game(c)

        # The next check retries, and a success clears the error.
        store.fail_upload = None
        assert check(c, store) is True
        assert c.app.state.ctx.backup_status.last_error is None


def test_failed_listing_doesnt_stop_the_app(tmp_path, temp_dir, idle_loop):
    store = FakeStore()
    store.fail_list = ConnectionError("nope")
    with TestClient(app_with(tmp_path)) as c:
        assert check(c, store) is False
        assert store.uploads == []
        assert c.get("/api/health").status_code == 200


def test_loop_survives_a_failing_store(tmp_path, temp_dir):
    store = FakeStore()
    store.fail_list = ConnectionError("nope")
    with TestClient(app_with(tmp_path, store=store)) as c:
        wait_for(lambda: c.app.state.ctx.backup_status.last_error == "ConnectionError")
        assert c.get("/api/health").status_code == 200


def test_failed_store_setup_shows_on_dashboard(tmp_path, temp_dir, monkeypatch):
    def broken(_settings):
        raise ValueError(SECRETS["backup_s3_endpoint"])

    monkeypatch.setattr(backup_upload, "S3BackupStore", broken)
    with TestClient(app_with(tmp_path)) as c:
        wait_for(lambda: c.app.state.ctx.backup_status.last_error == "ValueError")
        assert c.get("/api/health").status_code == 200


# ---------------------------------------------------------------- retention
def test_keeps_the_newest_and_ignores_unrelated_objects(tmp_path, temp_dir, idle_loop):
    ours = [aged(25 + 24 * i) for i in range(5)]
    unrelated = [
        "backups/notes.txt",
        "backups/luckdecidesyourfate-20200101-000000.db.bak",
        "backups/other-20200101-000000.db",
        "backups/luckdecidesyourfate-2020.db",
        "backups/sub/luckdecidesyourfate-20200101-000000.db",
        "luckdecidesyourfate-20200101-000000.db",
        "other/luckdecidesyourfate-20200101-000000.db",
    ]
    long_ago = datetime(2020, 1, 1, tzinfo=UTC)
    store = FakeStore([*ours, *(StoredBackup(k, long_ago) for k in unrelated)])
    with TestClient(app_with(tmp_path, backup_keep=3)) as c:
        assert check(c, store) is True
    remaining = set(store.objects)
    assert set(unrelated) <= remaining
    # The new upload plus the two newest old copies.
    assert remaining - set(unrelated) == {store.uploads[0], ours[0].key, ours[1].key}
    assert set(store.deleted) == {o.key for o in ours[2:]}


def test_failed_cleanup_keeps_the_backup_and_shows_the_error(tmp_path, temp_dir, idle_loop):
    store = FakeStore([aged(30), aged(54)])

    def refuse(_key):
        raise PermissionError("nope")

    store.delete = refuse
    with TestClient(app_with(tmp_path, backup_keep=1)) as c:
        assert check(c, store) is True
        assert c.app.state.ctx.backup_status.last_error == "PermissionError"
    assert len(store.uploads) == 1


# ---------------------------------------------------------------- secrecy
def test_secrets_stay_out_of_logs_and_dashboard(tmp_path, temp_dir, idle_loop, caplog):
    store = FakeStore()
    message = " ".join(SECRETS.values())
    store.fail_upload = RuntimeError(message)
    with caplog.at_level(logging.DEBUG, logger="app"), TestClient(app_with(tmp_path)) as c:
        check(c, store)
        token = c.post("/api/admin/login", json={"password": "testpass"}).cookies["admin_session"]
        c.cookies.clear()
        dash = c.get("/api/admin/dashboard", headers={"Cookie": f"admin_session={token}"}).json()
    assert dash["backup"]["enabled"] is True
    assert dash["backup"]["last_error"] == "RuntimeError"
    text = caplog.text + json.dumps(dash)
    assert "backups=on" in caplog.text
    for secret in SECRETS.values():
        assert secret not in text


def test_public_state_and_player_sockets_dont_have_the_field(client, admin):
    gid = new_link(admin, client, ["Anna", "Ben"], label="x")
    assert "backup" not in keys_deep(client.get(f"/api/games/{gid}").json())
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        assert "backup" not in keys_deep(p.receive_json())
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]})
        assert "backup" not in keys_deep(p.receive_json())
