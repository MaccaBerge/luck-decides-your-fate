"""Rule engine over the API: chance, streak breaker, script and the all-fair (panic) button."""
from .helpers import new_link, wait_spin
from .test_public_api import err


def spin(client, gid) -> str:
    r = client.post(f"/api/games/{gid}/spin")
    assert r.status_code == 202, r.text
    wait_spin()
    return r.json()["winner_name"]


def test_update_chance_streak_and_script(admin):
    gid = new_link(admin, mode="always", target_names=["Jonas"])
    r = admin.patch(f"/api/admin/links/{gid}", json={"chance": 40, "max_streak": 2, "script": [" Mia ", "", "Jonas"]})
    assert r.status_code == 200, r.text
    link = r.json()["link"]
    assert (link["chance"], link["max_streak"], link["script"]) == (40, 2, ["Mia", "Jonas"])
    r = admin.patch(f"/api/admin/links/{gid}", json={"chance": None, "max_streak": None, "script": []})
    link = r.json()["link"]
    assert (link["chance"], link["max_streak"], link["script"]) == (None, None, [])


def test_update_validation(admin):
    gid = new_link(admin)
    for body in ({"chance": 0}, {"chance": 101}, {"max_streak": 0}, {"max_streak": 21},
                 {"script": None}, {"script": ["x" * 41]}, {"script": ["a"] * 21}):
        err(admin.patch(f"/api/admin/links/{gid}", json=body), 422, "validation_error")


def test_script_steps_are_used_up_in_order(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas", "Mia", "Per"], mode="always", target_names=["Per"])
    admin.patch(f"/api/admin/links/{gid}", json={"script": ["Mia", "Anna", "Mia"]})
    assert [spin(client, gid) for _ in range(5)] == ["Mia", "Anna", "Mia", "Per", "Per"]
    state = admin.get(f"/api/admin/links/{gid}").json()
    assert state["link"]["script"] == []
    assert all(h["rule_applied"] for h in state["spin_history"])


def test_script_step_waits_until_its_name_is_on_the_wheel(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Jonas"])
    admin.patch(f"/api/admin/links/{gid}", json={"script": ["Mia"]})
    rs = admin.get(f"/api/admin/links/{gid}").json()["rule_status"]
    assert rs["script_step"] == {"name": "Mia", "entry_ids": []} and rs["decider"] == "rule"
    assert spin(client, gid) == "Jonas"
    client.post(f"/api/games/{gid}/entries", json={"names": ["Mia"]})
    rs = admin.get(f"/api/admin/links/{gid}").json()["rule_status"]
    assert rs["decider"] == "script" and len(rs["script_step"]["entry_ids"]) == 1
    assert spin(client, gid) == "Mia"
    assert spin(client, gid) == "Jonas"


def test_streak_breaker(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Jonas"])
    admin.patch(f"/api/admin/links/{gid}", json={"max_streak": 2})
    assert [spin(client, gid) for _ in range(2)] == ["Jonas", "Jonas"]
    rs = admin.get(f"/api/admin/links/{gid}").json()["rule_status"]
    assert rs["state"] == "streak_paused" and rs["streak"] == 2 and rs["decider"] == "fair"
    # Fair until someone else wins; then the rule is back.
    for _ in range(30):
        if spin(client, gid) == "Anna":
            break
    else:
        raise AssertionError("Anna never won a fair spin")
    hist = admin.get(f"/api/admin/links/{gid}").json()["spin_history"]
    assert not hist[0]["rule_applied"]
    assert spin(client, gid) == "Jonas"


def test_chance_over_many_spins(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Jonas"])
    admin.patch(f"/api/admin/links/{gid}", json={"chance": 50})
    winners = [spin(client, gid) for _ in range(30)]
    assert 5 <= winners.count("Jonas") <= 25  # not every spin, not never


def test_all_fair(client, admin):
    a = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Jonas"])
    b = new_link(admin, client, ["Anna", "Jonas"], mode="fair")
    admin.patch(f"/api/admin/links/{b}", json={"script": ["Anna"]})
    c = new_link(admin, client, ["Anna", "Jonas"], mode="fair")
    r = admin.post("/api/admin/all-fair")
    assert r.status_code == 200 and r.json() == {"changed": 2}
    for gid in (a, b, c):
        link = admin.get(f"/api/admin/links/{gid}").json()["link"]
        assert link["mode"] == "fair" and link["script"] == []
    assert admin.get(f"/api/admin/links/{a}").json()["link"]["target_names"] == ["Jonas"]  # kept
    assert admin.post("/api/admin/all-fair").json() == {"changed": 0}
    assert client.post("/api/admin/all-fair").status_code == 401


def test_rule_changes_send_nothing_to_players(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Jonas"])
    with client.websocket_connect(f"/ws/games/{gid}?resume=1") as p:
        p.receive_json()
        for body in ({"chance": 30}, {"max_streak": 3}, {"script": ["Anna"]}, {"script": []}):
            assert admin.patch(f"/api/admin/links/{gid}", json=body).status_code == 200
        assert admin.post("/api/admin/all-fair").status_code == 200
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]})
        m = p.receive_json()  # the very next message is the marker: nothing came before it
        assert m["type"] == "state" and m["state"]["entries"][-1]["name"] == "Marker"


def test_spin_payload_is_the_same_for_script_and_fair(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="fair")
    admin.patch(f"/api/admin/links/{gid}", json={"script": ["Anna"]})
    scripted = client.post(f"/api/games/{gid}/spin").json()
    wait_spin()
    fair = client.post(f"/api/games/{gid}/spin").json()
    wait_spin()
    assert set(scripted) == set(fair)


def test_controller_sees_the_step_used_up_as_the_spin_starts(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="fair")
    admin.patch(f"/api/admin/links/{gid}", json={"script": ["Anna", "Jonas"]})
    with admin.websocket_connect(f"/ws/admin/games/{gid}") as ws:
        ws.receive_json()
        client.post(f"/api/games/{gid}/spin")
        while (m := ws.receive_json())["type"] != "admin_state":
            pass
        assert m["state"]["game"]["current_spin"] is not None
        assert m["state"]["link"]["script"] == ["Jonas"]
    wait_spin()
