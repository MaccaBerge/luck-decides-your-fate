"""Ordinary wheels in the controller: the friends list, friends' wheels, the standing rule and
taking over a single wheel. None of it is ever visible to players."""
from .helpers import FORBIDDEN_KEYS, keys_deep, new_game, new_link, wait_spin
from .test_public_api import err

FRIENDS = [["Jonas", "Jonny"], ["Mia"], ["Marcus"]]


def setup(admin, standing=None):
    assert admin.put("/api/admin/friends", json={"friends": FRIENDS}).status_code == 200
    if standing:
        r = admin.patch("/api/admin/standing-rule", json=standing)
        assert r.status_code == 200, r.text


def spin(client, gid) -> str:
    r = client.post(f"/api/games/{gid}/spin")
    assert r.status_code == 202, r.text
    wait_spin()
    return r.json()["winner_name"]


def test_friends_list_round_trip(admin):
    r = admin.put("/api/admin/friends", json={"friends": [[" Jonas ", "", "Jonny"], [], ["Mia"]]})
    assert r.status_code == 200
    assert r.json()["friends"] == [["Jonas", "Jonny"], ["Mia"]]
    body = admin.get("/api/admin/friends").json()
    assert body["standing"] == {"mode": "fair", "target_names": [], "chance": None, "max_streak": None}
    err(admin.put("/api/admin/friends", json={"friends": [["x" * 41]]}), 422, "validation_error")
    err(admin.put("/api/admin/friends", json={"friends": [["a"]] * 51}), 422, "validation_error")


def test_dashboard_lists_friends_wheels_apart(client, admin):
    setup(admin)
    stranger = new_game(client, ["Anna", "Jonas"])         # one friend: not a match
    a = new_game(client, ["Jonny", "Mia", "Per"])
    b = new_game(client, ["Marcus", "Jonas"])               # two matched wheels at once
    link = new_link(admin, client, ["Jonas", "Mia"])        # links are listed as links
    wheels = admin.get("/api/admin/dashboard").json()["wheels"]
    assert [w["id"] for w in wheels["matched"]] == [b, a]   # most recently used first
    assert [w["id"] for w in wheels["others"]] == [stranger]
    assert wheels["matched"][1]["control"] == {"source": "standing", "friends": ["Jonas", "Mia"], "matched": True}
    assert wheels["matched"][1]["names"] == ["Jonny", "Mia", "Per"]
    assert link not in [w["id"] for w in wheels["matched"] + wheels["others"]]


def test_standing_rule_decides_friends_wheels_only(client, admin):
    setup(admin, {"mode": "always", "target_names": ["Mia"]})
    matched = new_game(client, ["Jonas", "Mia", "Per", "Kari"])
    other = new_game(client, ["Anna", "Mia", "Per", "Kari"])
    assert [spin(client, matched) for _ in range(4)] == ["Mia"] * 4
    hist = admin.get(f"/api/admin/wheels/{matched}").json()["spin_history"]
    assert all(h["rule_applied"] and h["mode"] == "always" for h in hist)
    assert not any(h["rule_applied"] for h in admin.get(f"/api/admin/wheels/{other}").json()["spin_history"] or [])
    for _ in range(3):
        spin(client, other)
    assert not any(h["rule_applied"] for h in admin.get(f"/api/admin/wheels/{other}").json()["spin_history"])


def test_taking_over_a_wheel_and_handing_it_back(client, admin):
    setup(admin, {"mode": "always", "target_names": ["Mia"], "chance": 100})
    gid = new_game(client, ["Jonas", "Mia", "Per"])
    # Changing only the chance starts from the standing rule: still "always Mia".
    r = admin.patch(f"/api/admin/wheels/{gid}", json={"max_streak": 3})
    body = r.json()
    assert body["control"]["source"] == "own"
    assert (body["link"]["mode"], body["link"]["target_names"], body["link"]["max_streak"]) == ("always", ["Mia"], 3)
    admin.patch(f"/api/admin/wheels/{gid}", json={"mode": "never"})
    assert spin(client, gid) != "Mia"
    # The standing rule changing doesn't touch a wheel with its own rule.
    admin.patch("/api/admin/standing-rule", json={"target_names": ["Per"]})
    assert admin.get(f"/api/admin/wheels/{gid}").json()["link"]["mode"] == "never"
    body = admin.patch(f"/api/admin/wheels/{gid}", json={"own_rule": False}).json()
    assert body["control"]["source"] == "standing"
    assert (body["link"]["mode"], body["link"]["target_names"]) == ("always", ["Per"])
    assert spin(client, gid) == "Per"


def test_next_winners_on_a_wheel_keep_the_standing_rule(client, admin):
    setup(admin, {"mode": "always", "target_names": ["Mia"]})
    gid = new_game(client, ["Jonas", "Mia", "Per"])
    body = admin.patch(f"/api/admin/wheels/{gid}", json={"script": ["Per"]}).json()
    assert body["control"]["source"] == "standing" and body["rule_status"]["decider"] == "script"
    assert [spin(client, gid), spin(client, gid)] == ["Per", "Mia"]


def test_an_unmatched_wheel_can_be_taken_over(client, admin):
    gid = new_game(client, ["Anna", "Per"])
    body = admin.patch(f"/api/admin/wheels/{gid}", json={"mode": "always", "target_names": ["Anna"]}).json()
    assert body["control"] == {"source": "own", "friends": [], "matched": False}
    assert [spin(client, gid) for _ in range(3)] == ["Anna"] * 3


def test_wheel_routes(client, admin):
    link = new_link(admin)
    err(admin.get(f"/api/admin/wheels/{link}"), 404, "game_not_found")
    err(admin.get("/api/admin/wheels/zzzzzzzz"), 404, "game_not_found")
    gid = new_game(client)
    err(admin.patch(f"/api/admin/wheels/{gid}", json={}), 422, "validation_error")
    err(admin.patch(f"/api/admin/wheels/{gid}", json={"own_rule": True}), 422, "validation_error")
    err(admin.patch(f"/api/admin/wheels/{gid}", json={"chance": 0}), 422, "validation_error")
    assert client.get(f"/api/admin/wheels/{gid}").status_code == 401
    assert client.put("/api/admin/friends", json={"friends": []}).status_code == 401
    assert client.patch("/api/admin/standing-rule", json={"mode": "fair"}).status_code == 401


def test_all_fair_covers_wheels_and_the_standing_rule(client, admin):
    setup(admin, {"mode": "always", "target_names": ["Mia"]})
    owned = new_game(client, ["Anna", "Per"])
    admin.patch(f"/api/admin/wheels/{owned}", json={"mode": "always", "target_names": ["Anna"]})
    assert admin.post("/api/admin/all-fair").json() == {"changed": 2}
    assert admin.get("/api/admin/friends").json()["standing"]["mode"] == "fair"
    assert admin.get(f"/api/admin/wheels/{owned}").json()["link"]["mode"] == "fair"


def test_nothing_reaches_players(client, admin):
    gid = new_game(client, ["Jonas", "Mia"])
    with client.websocket_connect(f"/ws/games/{gid}?resume=1") as p:
        first = p.receive_json()
        assert not keys_deep(first) & FORBIDDEN_KEYS
        setup(admin, {"mode": "always", "target_names": ["Mia"]})
        admin.patch(f"/api/admin/wheels/{gid}", json={"script": ["Jonas"]})
        admin.patch(f"/api/admin/wheels/{gid}", json={"mode": "never"})
        admin.patch(f"/api/admin/wheels/{gid}", json={"own_rule": False})
        admin.post("/api/admin/all-fair")
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]})
        m = p.receive_json()  # the very next message is the marker
        assert m["type"] == "state" and m["state"]["entries"][-1]["name"] == "Marker"
        assert not keys_deep(m) & FORBIDDEN_KEYS


def test_controller_watches_a_wheel_live(client, admin):
    setup(admin, {"mode": "always", "target_names": ["Mia"]})
    gid = new_game(client, ["Jonas", "Mia"])
    with admin.websocket_connect(f"/ws/admin/games/{gid}") as ws:
        assert ws.receive_json()["state"]["control"]["source"] == "standing"
        client.post(f"/api/games/{gid}/spin")
        types = set()
        while "spin_started" not in types or "admin_state" not in types:
            types.add(ws.receive_json()["type"])
    wait_spin()


def test_delete_a_wheel_in_use(client, admin):
    import pytest
    from starlette.websockets import WebSocketDisconnect

    gid = new_game(client, ["Anna", "Per"])
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        w = admin.get("/api/admin/dashboard").json()["wheels"]["others"][0]
        assert (w["id"], w["open_now"], w["viewers"], w["spinning"]) == (gid, True, 1, False)
        client.post(f"/api/games/{gid}/spin")
        p.receive_json()  # spin_started
        assert admin.get("/api/admin/dashboard").json()["wheels"]["others"][0]["spinning"] is True
        assert admin.delete(f"/api/admin/wheels/{gid}").status_code == 204  # even mid-spin
        assert p.receive_json() == {"type": "game_deleted", "reason": "operator"}
        with pytest.raises(WebSocketDisconnect):
            p.receive_json()
    assert client.get(f"/api/games/{gid}").status_code == 404
    assert admin.get("/api/admin/dashboard").json()["wheels"]["others"] == []
    err(admin.delete(f"/api/admin/wheels/{gid}"), 404, "game_not_found")
    link = new_link(admin)
    err(admin.delete(f"/api/admin/wheels/{link}"), 404, "game_not_found")  # links: /links/{id}
    assert client.delete(f"/api/admin/wheels/{link}").status_code == 401
