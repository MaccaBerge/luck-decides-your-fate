"""Admin REST API (§8.2): auth, links CRUD, rule application, mark_opened semantics."""
import pytest

from .helpers import PASSWORD, new_game, new_link, wait_spin
from .test_public_api import err

ADMIN_ROUTES = [
    ("post", "/api/admin/logout", None),
    ("get", "/api/admin/me", None),
    ("get", "/api/admin/dashboard", None),
    ("post", "/api/admin/links", {"label": "x"}),
    ("get", "/api/admin/links/abcdefgh", None),
    ("patch", "/api/admin/links/abcdefgh", {"mode": "fair"}),
    ("delete", "/api/admin/links/abcdefgh", None),
]


@pytest.mark.parametrize("method,path,body", ADMIN_ROUTES)
def test_admin_routes_require_session(client, method, path, body):
    kw = {"json": body} if body is not None else {}
    err(getattr(client, method)(path, **kw), 401, "unauthorized")
    kw["headers"] = {"Cookie": "admin_session=forged-token"}
    err(getattr(client, method)(path, **kw), 401, "unauthorized")


def test_login_wrong_password(client):
    err(client.post("/api/admin/login", json={"password": "nope"}), 401, "invalid_password")
    err(client.post("/api/admin/login", json={}), 422, "validation_error")


def test_login_cookie_and_logout(client):
    r = client.post("/api/admin/login", json={"password": PASSWORD})
    assert r.status_code == 200 and r.json() == {"ok": True}
    cookie = r.headers["set-cookie"]
    assert "admin_session=" in cookie
    low = cookie.lower()
    assert "httponly" in low and "samesite=lax" in low and "path=/" in low
    assert "secure" not in low.replace("samesite", "")
    token = r.cookies["admin_session"]
    client.cookies.clear()
    h = {"Cookie": f"admin_session={token}"}
    assert client.get("/api/admin/me", headers=h).json() == {"authenticated": True}
    r = client.post("/api/admin/logout", headers=h)
    assert r.status_code == 204 and r.content == b""
    assert "admin_session=" in r.headers.get("set-cookie", "")
    err(client.get("/api/admin/me", headers=h), 401, "unauthorized")  # invalidated server-side


def test_cookie_secure_flag(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app

    from .helpers import make_settings

    app = create_app(make_settings(tmp_path, cookie_secure=True), run_cleanup=False)
    with TestClient(app, base_url="https://testserver") as c:
        r = c.post("/api/admin/login", json={"password": PASSWORD})
        assert "secure" in r.headers["set-cookie"].lower().replace("samesite", "")


def test_create_link(admin):
    r = admin.post(
        "/api/admin/links",
        json={"label": "  Party  ", "mode": "always", "target_names": [" Erik ", "", "Jonas"]},
    )
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"game", "link", "rule_status", "spin_history"}
    link = body["link"]
    gid = body["game"]["id"]
    assert link["id"] == gid and link["path"] == f"/g/{gid}"
    assert link["label"] == "Party" and link["mode"] == "always"
    assert link["target_names"] == ["Erik", "Jonas"]
    assert link["status"] == "created" and link["player_count"] == 0 and link["entry_count"] == 0
    assert link["first_opened_at"] is None
    assert body["rule_status"] == {
        "state": "no_match",
        "matched_target": None,
        "matched_entry_ids": [],
        "targets": [{"name": "Erik", "entry_ids": []}, {"name": "Jonas", "entry_ids": []}],
        "script_step": None,
        "streak": 0,
        "decider": "fair",
    }
    assert link["chance"] is None and link["max_streak"] is None and link["script"] == []
    assert body["spin_history"] == []


def test_create_link_defaults_and_empty_label(admin):
    r = admin.post("/api/admin/links", json={"label": "   "})
    assert r.status_code == 201
    link = r.json()["link"]
    assert link["label"] is None and link["mode"] == "fair" and link["target_names"] == []
    assert r.json()["rule_status"]["state"] == "fair_mode"


@pytest.mark.parametrize(
    "body",
    [
        {"label": "x" * 61},
        {"mode": "sometimes"},
        {"target_names": ["x" * 41]},
        {"target_names": [f"t{i}" for i in range(21)]},
        {"target_names": "Jonas"},
    ],
)
def test_create_link_validation(admin, body):
    err(admin.post("/api/admin/links", json=body), 422, "validation_error")


def test_get_link_404s(client, admin):
    pub = new_game(client)
    err(admin.get(f"/api/admin/links/{pub}"), 404, "game_not_found")
    err(admin.get("/api/admin/links/zzzzzzzz"), 404, "game_not_found")
    err(admin.patch(f"/api/admin/links/{pub}", json={"mode": "always"}), 404, "game_not_found")
    err(admin.delete(f"/api/admin/links/{pub}"), 404, "game_not_found")
    assert client.get(f"/api/games/{pub}").status_code == 200  # public game untouched


def test_admin_get_does_not_mark_opened(client, admin):
    gid = new_link(admin, label="L")
    for _ in range(3):
        link = admin.get(f"/api/admin/links/{gid}").json()["link"]
        assert link["first_opened_at"] is None and link["status"] == "created"
    admin.get("/api/admin/dashboard")
    patched = admin.patch(f"/api/admin/links/{gid}", json={"mode": "never"}).json()["link"]
    assert patched["status"] == "created"
    # friend GET flips it
    client.get(f"/api/games/{gid}")
    link = admin.get(f"/api/admin/links/{gid}").json()["link"]
    assert link["first_opened_at"] is not None and link["status"] == "disconnected"
    first = link["first_opened_at"]
    client.get(f"/api/games/{gid}")
    assert admin.get(f"/api/admin/links/{gid}").json()["link"]["first_opened_at"] == first


def test_update_link(client, admin):
    gid = new_link(admin, client, ["Anna", " JONAS "], label="Old", mode="fair", target_names=["x"])
    err(admin.patch(f"/api/admin/links/{gid}", json={}), 422, "validation_error")
    err(admin.patch(f"/api/admin/links/{gid}", json={"mode": None}), 422, "validation_error")
    err(admin.patch(f"/api/admin/links/{gid}", json={"label": "y" * 61}), 422, "validation_error")
    err(admin.patch(f"/api/admin/links/{gid}", json={"target_names": ["y" * 41]}), 422, "validation_error")

    r = admin.patch(f"/api/admin/links/{gid}", json={"target_names": ["Erik", "jonas", "Anna"], "mode": "always"})
    assert r.status_code == 200
    body = r.json()
    assert body["link"]["label"] == "Old"  # untouched
    assert body["rule_status"]["state"] == "active" and body["rule_status"]["matched_target"] == "jonas"
    jonas = [e["id"] for e in body["game"]["entries"] if e["name"] == "JONAS"]
    assert body["rule_status"]["matched_entry_ids"] == jonas

    r = admin.patch(f"/api/admin/links/{gid}", json={"label": None})
    assert r.json()["link"]["label"] is None and r.json()["link"]["mode"] == "always"
    r = admin.patch(f"/api/admin/links/{gid}", json={"label": "  New "})
    assert r.json()["link"]["label"] == "New"


def test_rule_always_and_never(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas", "Per", "Kari"], mode="always", target_names=["jonas"])
    for _ in range(6):
        s = client.post(f"/api/games/{gid}/spin").json()
        assert s["winner_name"] == "Jonas"
        wait_spin()
    admin.patch(f"/api/admin/links/{gid}", json={"mode": "never"})
    for _ in range(6):
        assert client.post(f"/api/games/{gid}/spin").json()["winner_name"] != "Jonas"
        wait_spin()
    hist = admin.get(f"/api/admin/links/{gid}").json()["spin_history"]
    assert len(hist) == 12
    assert all(h["rule_applied"] for h in hist)
    assert [h["mode"] for h in hist] == ["never"] * 6 + ["always"] * 6  # newest first
    assert all(h["finished_at"] for h in hist)
    assert hist[0]["spin_id"] > hist[-1]["spin_id"]


def test_rule_change_mid_spin_does_not_affect_running_spin(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Jonas"])
    s = client.post(f"/api/games/{gid}/spin").json()
    admin.patch(f"/api/admin/links/{gid}", json={"mode": "never"})  # allowed during a spin
    wait_spin()
    assert client.get(f"/api/games/{gid}").json()["last_result"]["winner_name"] == s["winner_name"] == "Jonas"


def test_never_with_remove_winner_leaves_target_last(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas", "Per", "Kari"], mode="never", target_names=["Jonas"])
    client.patch(f"/api/games/{gid}/settings", json={"remove_winner": True})
    for _ in range(3):
        assert client.post(f"/api/games/{gid}/spin").status_code == 202
        wait_spin()
    active = [e["name"] for e in client.get(f"/api/games/{gid}").json()["entries"] if e["is_active"]]
    assert active == ["Jonas"]
    err(client.post(f"/api/games/{gid}/spin"), 409, "not_enough_entries")


def test_dashboard(client, admin):
    pub = new_game(client)
    l1 = new_link(admin, label="one")
    l2 = new_link(admin, client, ["A", "B", "C"], label="two")
    d = admin.get("/api/admin/dashboard").json()
    assert set(d) == {"live_games", "links", "backup"}
    assert d["live_games"] == 0
    ids = [link["id"] for link in d["links"]]
    assert ids == [l2, l1]  # newest first
    assert pub not in ids
    assert d["links"][0]["entry_count"] == 3


def test_delete_link(client, admin):
    gid = new_link(admin, client, ["A", "B"], label="bye")
    client.post(f"/api/games/{gid}/spin")
    r = admin.delete(f"/api/admin/links/{gid}")  # even mid-spin
    assert r.status_code == 204 and r.content == b""
    err(client.get(f"/api/games/{gid}"), 404, "game_not_found")
    err(admin.get(f"/api/admin/links/{gid}"), 404, "game_not_found")
    err(admin.delete(f"/api/admin/links/{gid}"), 404, "game_not_found")
    wait_spin()  # the cancelled finish task must not blow up
    assert gid not in [link["id"] for link in admin.get("/api/admin/dashboard").json()["links"]]


def test_last_result_survives_restart(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app

    from .helpers import make_settings

    settings = make_settings(tmp_path)
    with TestClient(create_app(settings, run_cleanup=False)) as c:
        gid = new_game(c, ["A", "B"])
        s = c.post(f"/api/games/{gid}/spin").json()
        wait_spin()
    with TestClient(create_app(settings, run_cleanup=False)) as c:
        lr = c.get(f"/api/games/{gid}").json()["last_result"]
        assert lr["spin_id"] == s["spin_id"]


def test_dangling_spin_finished_on_startup(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app

    from .helpers import make_settings

    settings = make_settings(tmp_path, spin_duration_ms_min=5000, spin_duration_ms_max=5000)
    with TestClient(create_app(settings, run_cleanup=False)) as c:
        gid = new_game(c, ["A", "B"])
        s = c.post(f"/api/games/{gid}/spin").json()
    # server "crashed" mid-spin; the next start finishes the dangling spin
    with TestClient(create_app(settings, run_cleanup=False)) as c:
        state = c.get(f"/api/games/{gid}").json()
        assert state["current_spin"] is None
        assert state["last_result"]["spin_id"] == s["spin_id"]
        assert c.post(f"/api/games/{gid}/spin").status_code == 202


def test_rule_status_targets_follow_entries(client, admin):
    from .helpers import assert_no_leak, new_link
    gid = new_link(admin, client, ["Anna", "Jonas", "jonas"], mode="always", target_names=["Erik", "Jonas"])
    st = admin.get(f"/api/admin/links/{gid}").json()
    ids = {e["name"]: e["id"] for e in st["game"]["entries"]}
    assert st["rule_status"]["targets"] == [
        {"name": "Erik", "entry_ids": []},
        {"name": "Jonas", "entry_ids": [ids["Jonas"], ids["jonas"]]},
    ]
    # An inactive entry is not a match.
    client.patch(f"/api/games/{gid}/entries/{ids['jonas']}", json={"is_active": False})
    st = admin.get(f"/api/admin/links/{gid}").json()
    assert st["rule_status"]["targets"][1] == {"name": "Jonas", "entry_ids": [ids["Jonas"]]}
    assert_no_leak(client.get(f"/api/games/{gid}").json())


def test_clicking_targets_sends_nothing_to_players(client, admin):
    from .helpers import new_link
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="always")
    with client.websocket_connect(f"/ws/games/{gid}?resume=1") as p:
        p.receive_json()
        for targets in (["Anna"], ["Anna", "Jonas"], ["Jonas"], []):
            r = admin.patch(f"/api/admin/links/{gid}", json={"target_names": targets})
            assert r.status_code == 200
            assert [t["name"] for t in r.json()["rule_status"]["targets"]] == targets
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]})
        m = p.receive_json()
        assert m["type"] == "state" and m["state"]["entries"][-1]["name"] == "Marker"
