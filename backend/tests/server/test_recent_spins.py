"""v1.2: the public list of recent spins, and that it stays free of rule information."""
import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.views import PUBLIC_HISTORY_LIMIT

from .helpers import assert_no_leak, make_settings, new_game, new_link, wait_spin

ALLOWED = {"spin_id", "winner_name", "finished_at"}


def spin_and_wait(client, gid):
    r = client.post(f"/api/games/{gid}/spin")
    assert r.status_code == 202, r.text
    wait_spin()
    return r.json()


def recent(client, gid):
    return client.get(f"/api/games/{gid}").json()["recent_spins"]


def until(ws, pred, limit=20):
    for _ in range(limit):
        m = ws.receive_json()
        if pred(m):
            return m
    raise AssertionError("expected message never arrived")


def test_empty_on_a_new_wheel(client):
    assert recent(client, new_game(client, ["Anna", "Ben"])) == []


def test_rigged_link_rest_has_only_the_allowed_keys(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], label="x", mode="always", target_names=["Jonas"])
    spin_and_wait(client, gid)
    body = client.get(f"/api/games/{gid}").json()
    assert_no_leak(body)
    assert [set(s) for s in body["recent_spins"]] == [ALLOWED]
    assert body["recent_spins"][0]["winner_name"] == "Jonas"


def test_rigged_link_socket_has_only_the_allowed_keys(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], label="x", mode="always", target_names=["Jonas"])
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        client.post(f"/api/games/{gid}/spin")
        m = until(p, lambda m: m["type"] == "state" and m["state"]["recent_spins"])
        assert_no_leak(m)
        assert [set(s) for s in m["state"]["recent_spins"]] == [ALLOWED]
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        m = p.receive_json()
        assert_no_leak(m)
        assert [set(s) for s in m["state"]["recent_spins"]] == [ALLOWED]


def test_spin_in_progress_is_not_listed(tmp_path):
    settings = make_settings(tmp_path, spin_duration_ms_min=600, spin_duration_ms_max=600)
    with TestClient(create_app(settings, run_cleanup=False)) as client:
        gid = new_game(client, ["Anna", "Ben"])
        with client.websocket_connect(f"/ws/games/{gid}") as p:
            p.receive_json()
            spin = client.post(f"/api/games/{gid}/spin").json()
            assert recent(client, gid) == []
            during = client.get(f"/api/games/{gid}").json()
            assert during["current_spin"]["spin_id"] == spin["spin_id"]
            assert during["recent_spins"] == []
            # Every state sent before spin_finished must leave the spin out.
            while True:
                m = p.receive_json()
                if m["type"] == "spin_finished":
                    break
                if m["type"] == "state":
                    assert m["state"]["recent_spins"] == []
            m = until(p, lambda m: m["type"] == "state")
            assert [s["spin_id"] for s in m["state"]["recent_spins"]] == [spin["spin_id"]]


def test_newest_first_and_limited(tmp_path):
    settings = make_settings(tmp_path, spin_duration_ms_min=1, spin_duration_ms_max=1)
    with TestClient(create_app(settings, run_cleanup=False)) as client:
        gid = new_game(client, ["Anna", "Ben"])
        ids = []
        for _ in range(PUBLIC_HISTORY_LIMIT + 2):
            ids.append(client.post(f"/api/games/{gid}/spin").json()["spin_id"])
            time.sleep(0.4)
        listed = [s["spin_id"] for s in recent(client, gid)]
    assert PUBLIC_HISTORY_LIMIT == 10
    assert listed == list(reversed(ids))[:10]


@pytest.mark.parametrize("change", ["rename", "delete"])
def test_history_keeps_the_name_at_the_time(client, change):
    gid = new_game(client, ["Anna", "Ben"])
    winner = spin_and_wait(client, gid)
    url = f"/api/games/{gid}/entries/{winner['winner_entry_id']}"
    if change == "rename":
        assert client.patch(url, json={"name": "Renamed"}).status_code == 200
    else:
        assert client.delete(url).status_code == 200
    assert recent(client, gid)[0]["winner_name"] == winner["winner_name"]


def test_rule_change_still_sends_nothing_to_players(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], label="x", mode="fair")
    spin_and_wait(client, gid)
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        assert admin.patch(f"/api/admin/links/{gid}", json={"mode": "always", "target_names": ["Jonas"]}).status_code == 200
        # The next player message must be for this public change, nothing rule-related before it.
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]})
        m = p.receive_json()
        assert m["type"] == "state"
        assert m["state"]["entries"][-1]["name"] == "Marker"
        assert_no_leak(m)
