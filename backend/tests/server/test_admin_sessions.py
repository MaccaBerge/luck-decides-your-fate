"""The controller's login sessions: stored in the database, 60 days unused, 1 year at most."""
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.auth import device_label
from app.main import create_app
from app.timeutil import utc_iso

from .helpers import PASSWORD, make_settings

IPHONE_APP = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
)
MAC_SAFARI = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0"
    " Safari/605.1.15"
)


def run(tmp_path, fn, **overrides):
    """One app on the database in tmp_path (a restart is a second call)."""
    with TestClient(create_app(make_settings(tmp_path, **overrides), run_cleanup=False)) as c:
        return fn(c)


def login(c: TestClient, ua: str = MAC_SAFARI) -> str:
    r = c.post("/api/admin/login", json={"password": PASSWORD}, headers={"User-Agent": ua})
    assert r.status_code == 200, r.text
    token = r.cookies["admin_session"]
    c.cookies.clear()
    return token


def h(token: str) -> dict:
    return {"Cookie": f"admin_session={token}"}


def me(c: TestClient, token: str) -> int:
    return c.get("/api/admin/me", headers=h(token)).status_code


def db(tmp_path, sql: str, *args):
    con = sqlite3.connect(tmp_path / "test.db")
    try:
        rows = con.execute(sql, args).fetchall()
        con.commit()
        return rows
    finally:
        con.close()


def days_ago(n: float) -> str:
    return utc_iso(datetime.now(timezone.utc) - timedelta(days=n))


def test_cookie_lasts_a_year(client):
    r = client.post("/api/admin/login", json={"password": PASSWORD})
    assert f"max-age={365 * 24 * 60 * 60}" in r.headers["set-cookie"].lower()


def test_a_restart_keeps_you_logged_in(tmp_path):
    token = run(tmp_path, login)
    assert run(tmp_path, lambda c: me(c, token)) == 200


def test_the_database_never_holds_the_token(tmp_path):
    token = run(tmp_path, login)
    stored = db(tmp_path, "SELECT token_hash FROM admin_sessions")
    assert len(stored) == 1 and token not in stored[0][0]


def test_a_new_password_ends_every_session(tmp_path):
    token = run(tmp_path, login)
    assert run(tmp_path, lambda c: me(c, token), admin_password="another-password") == 401
    # Its row can't be matched to anything any more, and is deleted once it's 60 days unused.
    # (Telling old rows apart sooner would mean storing something derived from the password.)
    db(tmp_path, "UPDATE admin_sessions SET last_used_at = ?", days_ago(61))
    run(tmp_path, lambda c: None, admin_password="another-password")
    assert db(tmp_path, "SELECT COUNT(*) FROM admin_sessions") == [(0,)]


def test_sixty_days_unused_ends_it(tmp_path):
    token = run(tmp_path, login)
    db(tmp_path, "UPDATE admin_sessions SET last_used_at = ?", days_ago(59))
    assert run(tmp_path, lambda c: me(c, token)) == 200
    db(tmp_path, "UPDATE admin_sessions SET last_used_at = ?", days_ago(61))
    assert run(tmp_path, lambda c: me(c, token)) == 401


def test_using_it_keeps_it_alive_but_never_past_a_year(tmp_path):
    token = run(tmp_path, login)
    db(tmp_path, "UPDATE admin_sessions SET last_used_at = ?, created_at = ?", days_ago(30), days_ago(300))
    assert run(tmp_path, lambda c: me(c, token)) == 200
    (last_used,) = db(tmp_path, "SELECT last_used_at FROM admin_sessions")[0]
    assert last_used > days_ago(0.01)  # moved forward by the request
    db(tmp_path, "UPDATE admin_sessions SET created_at = ?", days_ago(366))
    assert run(tmp_path, lambda c: me(c, token)) == 401


def test_recent_use_is_not_written_again(tmp_path):
    token = run(tmp_path, login)
    (before,) = db(tmp_path, "SELECT last_used_at FROM admin_sessions")[0]
    run(tmp_path, lambda c: me(c, token))
    assert db(tmp_path, "SELECT last_used_at FROM admin_sessions")[0][0] == before


def test_logout_deletes_the_session(tmp_path):
    def go(c):
        token = login(c)
        assert c.post("/api/admin/logout", headers=h(token)).status_code == 204
        return token

    token = run(tmp_path, go)
    assert db(tmp_path, "SELECT COUNT(*) FROM admin_sessions") == [(0,)]
    assert run(tmp_path, lambda c: me(c, token)) == 401


def test_list_devices(client):
    phone = login(client, IPHONE_APP)
    mac = login(client, MAC_SAFARI)
    r = client.get("/api/admin/sessions", headers=h(mac))
    assert r.status_code == 200
    sessions = r.json()["sessions"]
    # Most recently used first.
    assert [(s["device"], s["current"]) for s in sessions] == [("Mac · Safari", True), ("iPhone · Home Screen app", False)]
    assert set(sessions[0]) == {"id", "device", "created_at", "last_used_at", "expires_at", "current"}
    assert client.get("/api/admin/sessions", headers=h(phone)).status_code == 200


def test_sign_out_one_device(client):
    phone = login(client, IPHONE_APP)
    mac = login(client)
    sessions = client.get("/api/admin/sessions", headers=h(mac)).json()["sessions"]
    phone_id = next(s["id"] for s in sessions if not s["current"])
    assert client.delete(f"/api/admin/sessions/{phone_id}", headers=h(mac)).status_code == 204
    assert me(client, phone) == 401 and me(client, mac) == 200
    r = client.delete(f"/api/admin/sessions/{phone_id}", headers=h(mac))
    assert r.status_code == 404 and r.json()["error"]["code"] == "session_not_found"


def test_sign_out_everywhere_else(client):
    others = [login(client, IPHONE_APP), login(client)]
    mine = login(client)
    assert client.post("/api/admin/sessions/sign-out-others", headers=h(mine)).status_code == 204
    assert [me(client, t) for t in others] == [401, 401]
    assert me(client, mine) == 200
    assert len(client.get("/api/admin/sessions", headers=h(mine)).json()["sessions"]) == 1


def test_session_routes_need_a_login(client):
    assert client.get("/api/admin/sessions").status_code == 401
    assert client.delete("/api/admin/sessions/x").status_code == 401
    assert client.post("/api/admin/sessions/sign-out-others").status_code == 401


def test_device_labels():
    assert device_label(IPHONE_APP) == "iPhone · Home Screen app"
    assert device_label(IPHONE_APP + " Safari/604.1") == "iPhone · Safari"
    assert device_label(MAC_SAFARI) == "Mac · Safari"
    assert device_label("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36") == "Windows · Chrome"
    assert device_label("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36") == "Android · Chrome"
    assert device_label(None) == "Unknown device"
