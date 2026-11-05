"""WebSockets (§9): close codes, presence, sync, rule-change silence, spin events, deletion."""
import pytest
from starlette.websockets import WebSocketDisconnect

from .helpers import assert_no_leak, new_game, new_link


def expect_close(ws_ctx, code):
    with ws_ctx as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == code


def until(ws, pred, limit=20):
    for _ in range(limit):
        m = ws.receive_json()
        if pred(m):
            return m
    raise AssertionError("expected message never arrived")


def test_player_socket_unknown_game_4404(client):
    expect_close(client.websocket_connect("/ws/games/zzzzzzzz"), 4404)


def test_admin_sockets_require_cookie_4401(client, admin):
    gid = new_link(admin, label="x")
    expect_close(client.websocket_connect("/ws/admin"), 4401)
    expect_close(client.websocket_connect(f"/ws/admin/games/{gid}"), 4401)
    bad = {"headers": {"Cookie": "admin_session=forged"}}
    expect_close(client.websocket_connect("/ws/admin", **bad), 4401)
    expect_close(client.websocket_connect(f"/ws/admin/games/{gid}", **bad), 4401)


def test_admin_game_socket_404_for_public_or_unknown(client, admin):
    pub = new_game(client)
    expect_close(admin.websocket_connect(f"/ws/admin/games/{pub}"), 4404)
    expect_close(admin.websocket_connect("/ws/admin/games/zzzzzzzz"), 4404)


def test_player_connect_sends_state_and_marks_opened(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], label="Secret", mode="always", target_names=["Jonas"])
    assert admin.get(f"/api/admin/links/{gid}").json()["link"]["status"] == "created"
    with client.websocket_connect(f"/ws/games/{gid}") as ws:
        m = ws.receive_json()
        assert m["type"] == "state" and m["state"]["id"] == gid
        assert len(m["state"]["entries"]) == 2
        assert_no_leak(m)
        link = admin.get(f"/api/admin/links/{gid}").json()["link"]
        assert link["status"] == "connected" and link["player_count"] == 1
        assert link["first_opened_at"] is not None
    link = admin.get(f"/api/admin/links/{gid}").json()["link"]
    assert link["status"] == "disconnected" and link["player_count"] == 0


def test_admin_sockets_never_count_as_players(client, admin):
    gid = new_link(admin, label="x")
    with admin.websocket_connect(f"/ws/admin/games/{gid}") as a, admin.websocket_connect("/ws/admin") as d:
        st = a.receive_json()
        assert st["type"] == "admin_state" and st["state"]["link"]["player_count"] == 0
        dash = d.receive_json()
        assert dash["type"] == "dashboard" and dash["dashboard"]["live_games"] == 0
        link = admin.get(f"/api/admin/links/{gid}").json()["link"]
        assert link["status"] == "created" and link["player_count"] == 0
        assert admin.get("/api/admin/dashboard").json()["live_games"] == 0


def test_presence_live_to_admin_and_dashboard(client, admin):
    gid = new_link(admin, label="x")
    pub = new_game(client)
    with admin.websocket_connect(f"/ws/admin/games/{gid}") as a, admin.websocket_connect("/ws/admin") as d:
        assert a.receive_json()["state"]["link"]["status"] == "created"
        assert d.receive_json()["dashboard"]["live_games"] == 0
        with client.websocket_connect(f"/ws/games/{gid}") as p1:
            p1.receive_json()
            m = until(a, lambda m: m["type"] == "admin_state" and m["state"]["link"]["player_count"] == 1)
            assert m["state"]["link"]["status"] == "connected"
            until(d, lambda m: m["dashboard"]["live_games"] == 1)
            with client.websocket_connect(f"/ws/games/{gid}") as p2, \
                    client.websocket_connect(f"/ws/games/{pub}") as p3:
                p2.receive_json()
                p3.receive_json()
                until(a, lambda m: m["type"] == "admin_state" and m["state"]["link"]["player_count"] == 2)
                until(d, lambda m: m["dashboard"]["live_games"] == 2)  # public games count too
            until(a, lambda m: m["type"] == "admin_state" and m["state"]["link"]["player_count"] == 1)
        m = until(a, lambda m: m["type"] == "admin_state" and m["state"]["link"]["player_count"] == 0)
        assert m["state"]["link"]["status"] == "disconnected"
        until(d, lambda m: m["dashboard"]["live_games"] == 0)


def test_public_changes_sync_to_players_and_admin(client, admin):
    gid = new_link(admin, label="x", mode="always", target_names=["Jonas"])
    with client.websocket_connect(f"/ws/games/{gid}") as p, admin.websocket_connect(f"/ws/admin/games/{gid}") as a:
        p.receive_json()
        a.receive_json()
        client.post(f"/api/games/{gid}/entries", json={"names": ["Anna", "Jonas", "Per"]})
        m = p.receive_json()
        assert m["type"] == "state" and len(m["state"]["entries"]) == 3
        assert_no_leak(m)
        m = until(a, lambda m: m["type"] == "admin_state" and len(m["state"]["game"]["entries"]) == 3)
        assert m["state"]["rule_status"]["state"] == "active"


def test_rule_patch_sends_nothing_to_players(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], label="x", mode="fair")
    with client.websocket_connect(f"/ws/games/{gid}") as p, admin.websocket_connect(f"/ws/admin/games/{gid}") as a:
        p.receive_json()
        a.receive_json()
        admin.patch(f"/api/admin/links/{gid}", json={"mode": "always", "target_names": ["Jonas"], "label": "y"})
        admin.patch(f"/api/admin/links/{gid}", json={"label": None})
        m = until(a, lambda m: m["type"] == "admin_state" and m["state"]["link"]["mode"] == "always")
        assert m["state"]["rule_status"]["matched_target"] == "Jonas"
        # The next player message must be the state for this public change, nothing rule-related before it.
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]})
        m = p.receive_json()
        assert m["type"] == "state"
        assert [e["name"] for e in m["state"]["entries"]][-1] == "Marker"
        assert_no_leak(m)


def test_spin_events(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas", "Per"], label="x", mode="always", target_names=["Jonas"])
    with client.websocket_connect(f"/ws/games/{gid}") as p, admin.websocket_connect(f"/ws/admin/games/{gid}") as a:
        p.receive_json()
        a.receive_json()
        r = client.post(f"/api/games/{gid}/spin")
        assert r.status_code == 202
        spin = r.json()

        ps = p.receive_json()
        assert ps == {"type": "spin_started", "spin": spin}
        assert_no_leak(ps)
        fin = p.receive_json()
        assert fin == {
            "type": "spin_finished", "spin_id": spin["spin_id"],
            "winner_entry_id": spin["winner_entry_id"], "winner_name": "Jonas",
        }
        st = p.receive_json()
        assert st["type"] == "state" and st["state"]["current_spin"] is None
        assert st["state"]["last_result"]["spin_id"] == spin["spin_id"]

        asp = until(a, lambda m: m["type"] == "spin_started")
        assert asp["rule_applied"] is True and asp["spin"] == spin
        afin = until(a, lambda m: m["type"] == "spin_finished")
        assert afin["spin_id"] == spin["spin_id"]
        ast = until(a, lambda m: m["type"] == "admin_state")
        assert ast["state"]["spin_history"][0]["finished_at"] is not None
        assert ast["state"]["game"]["current_spin"] is None


def test_late_joiner_sees_current_spin(client):
    gid = new_game(client, ["A", "B"])
    spin = client.post(f"/api/games/{gid}/spin").json()
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        st = p.receive_json()
        assert st["state"]["current_spin"] == spin
        until(p, lambda m: m["type"] == "spin_finished")


def test_delete_link_notifies_and_closes(client, admin):
    gid = new_link(admin, label="x")
    with client.websocket_connect(f"/ws/games/{gid}") as p, admin.websocket_connect(f"/ws/admin/games/{gid}") as a:
        p.receive_json()
        a.receive_json()
        assert admin.delete(f"/api/admin/links/{gid}").status_code == 204
        assert p.receive_json() == {"type": "game_deleted"}
        with pytest.raises(WebSocketDisconnect) as exc:
            p.receive_json()
        assert exc.value.code == 1000
        until(a, lambda m: m["type"] == "game_deleted")


def test_client_messages_are_ignored(client):
    gid = new_game(client, ["A", "B"])
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        p.send_text("hello")
        p.send_json({"type": "spin"})
        client.post(f"/api/games/{gid}/shuffle")
        assert p.receive_json()["type"] == "state"


def test_shutdown_closes_all_sockets_with_service_restart(tmp_path):
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    from app.main import create_app

    from .helpers import PASSWORD, make_settings

    app = create_app(make_settings(tmp_path), run_cleanup=False)
    with TestClient(app) as c:
        gid = c.post("/api/games").json()["id"]
        r = c.post("/api/admin/login", json={"password": PASSWORD})
        cookie = {"Cookie": f"admin_session={r.cookies['admin_session']}"}
        link = c.post("/api/admin/links", json={}, headers=cookie).json()["game"]["id"]
        c.cookies.clear()
        with c.websocket_connect(f"/ws/games/{gid}") as player, \
                c.websocket_connect(f"/ws/admin/games/{link}", headers=cookie) as link_admin, \
                c.websocket_connect("/ws/admin", headers=cookie) as dashboard:
            player.receive_json()
            link_admin.receive_json()
            dashboard.receive_json()
            c.portal.call(app.state.ctx.manager.shutdown)
            for ws in (player, link_admin, dashboard):
                try:
                    while True:
                        ws.receive_json()
                except WebSocketDisconnect as exc:
                    assert exc.code == 1012


def test_shutdown_cancels_pending_spin_tasks(tmp_path):
    from fastapi.testclient import TestClient

    from app.main import create_app

    from .helpers import make_settings, new_game

    settings = make_settings(tmp_path, spin_duration_ms_min=60000, spin_duration_ms_max=60000)
    app = create_app(settings, run_cleanup=False)
    with TestClient(app) as c:
        gid = new_game(c, ["A", "B"])
        assert c.post(f"/api/games/{gid}/spin").status_code == 202
        task = app.state.ctx.runtime.peek(gid).spin_task
        assert task is not None and not task.done()
    assert task.cancelled()
