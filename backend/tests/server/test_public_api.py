"""Public REST API (§8.1) + error envelope + spin lock + remove-winner."""
import pytest

from .helpers import assert_no_leak, new_game, new_link, wait_spin


def err(r, status, code):
    assert r.status_code == status, r.text
    body = r.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_create_game(client):
    r = client.post("/api/games")
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {
        "id", "game_type", "kind", "join_code", "entries", "settings", "current_spin",
        "last_result", "recent_spins", "players",
    }
    assert body["kind"] == "solo" and body["join_code"] is None and body["players"] == []
    assert body["game_type"] == "wheel"
    assert body["entries"] == []
    assert body["settings"] == {"remove_winner": False}
    assert body["current_spin"] is None and body["last_result"] is None
    assert len(body["id"]) == 8


def test_get_game_and_404(client):
    gid = new_game(client)
    r = client.get(f"/api/games/{gid}")
    assert r.status_code == 200 and r.json()["id"] == gid
    err(client.get("/api/games/zzzzzzzz"), 404, "game_not_found")


def test_add_entries_strips_and_drops_empty(client):
    gid = new_game(client)
    r = client.post(f"/api/games/{gid}/entries", json={"names": ["  Anna ", "", "   ", "Jonas"]})
    assert r.status_code == 200
    entries = r.json()["entries"]
    assert [e["name"] for e in entries] == ["Anna", "Jonas"]
    assert [e["position"] for e in entries] == [0, 1]
    assert all(e["is_active"] for e in entries)
    assert set(entries[0]) == {"id", "name", "color", "position", "is_active"}


@pytest.mark.parametrize(
    "body",
    [
        {"names": []},
        {"names": ["", "  "]},
        {"names": ["x" * 41]},
        {"names": ["a"] * 101},
        {},
        {"names": "Anna"},
    ],
)
def test_add_entries_validation(client, body):
    gid = new_game(client)
    err(client.post(f"/api/games/{gid}/entries", json=body), 422, "validation_error")


def test_validation_message_is_readable(client):
    gid = new_game(client)
    r = client.post(f"/api/games/{gid}/entries", json={"names": []})
    assert "names" in r.json()["error"]["message"]


def test_malformed_json_is_422(client):
    gid = new_game(client)
    r = client.post(
        f"/api/games/{gid}/entries", content=b"{not json", headers={"Content-Type": "application/json"}
    )
    err(r, 422, "validation_error")


def test_entries_limit(client):
    gid = new_game(client, [f"n{i}" for i in range(100)])
    err(client.post(f"/api/games/{gid}/entries", json={"names": ["one more"]}), 409, "entries_limit")
    # inactive entries count too
    first = client.get(f"/api/games/{gid}").json()["entries"][0]["id"]
    client.patch(f"/api/games/{gid}/entries/{first}", json={"is_active": False})
    err(client.post(f"/api/games/{gid}/entries", json={"names": ["x"]}), 409, "entries_limit")


def test_update_entry(client):
    gid = new_game(client, ["Anna", "Jonas"])
    eid = client.get(f"/api/games/{gid}").json()["entries"][0]["id"]
    r = client.patch(f"/api/games/{gid}/entries/{eid}", json={"name": "  Anne ", "color": "#00ff00"})
    assert r.status_code == 200
    e = r.json()["entries"][0]
    assert e["name"] == "Anne" and e["color"].lower() == "#00ff00"
    r = client.patch(f"/api/games/{gid}/entries/{eid}", json={"is_active": False})
    assert r.json()["entries"][0]["is_active"] is False


@pytest.mark.parametrize(
    "body", [{}, {"name": "   "}, {"name": "x" * 41}, {"color": "red"}, {"is_active": "maybe"}]
)
def test_update_entry_validation(client, body):
    gid = new_game(client, ["Anna", "Jonas"])
    eid = client.get(f"/api/games/{gid}").json()["entries"][0]["id"]
    err(client.patch(f"/api/games/{gid}/entries/{eid}", json=body), 422, "validation_error")


def test_entry_not_found(client):
    gid = new_game(client, ["Anna", "Jonas"])
    other = new_game(client, ["Per", "Kari"])
    foreign = client.get(f"/api/games/{other}").json()["entries"][0]["id"]
    err(client.patch(f"/api/games/{gid}/entries/{foreign}", json={"name": "X"}), 404, "entry_not_found")
    err(client.delete(f"/api/games/{gid}/entries/{foreign}"), 404, "entry_not_found")
    err(client.delete(f"/api/games/{gid}/entries/en_nope000000"), 404, "entry_not_found")


def test_delete_entry(client):
    gid = new_game(client, ["Anna", "Jonas"])
    eid = client.get(f"/api/games/{gid}").json()["entries"][0]["id"]
    r = client.delete(f"/api/games/{gid}/entries/{eid}")
    assert r.status_code == 200
    assert [e["name"] for e in r.json()["entries"]] == ["Jonas"]


def test_shuffle_keeps_ids(client):
    names = [f"n{i}" for i in range(10)]
    gid = new_game(client, names)
    before = {e["id"] for e in client.get(f"/api/games/{gid}").json()["entries"]}
    r = client.post(f"/api/games/{gid}/shuffle")
    assert r.status_code == 200
    entries = r.json()["entries"]
    assert {e["id"] for e in entries} == before
    assert [e["position"] for e in entries] == sorted(e["position"] for e in entries)


def test_restore(client):
    gid = new_game(client, ["Anna", "Jonas"])
    for e in client.get(f"/api/games/{gid}").json()["entries"]:
        client.patch(f"/api/games/{gid}/entries/{e['id']}", json={"is_active": False})
    r = client.post(f"/api/games/{gid}/restore")
    assert r.status_code == 200 and all(e["is_active"] for e in r.json()["entries"])


def test_settings(client):
    gid = new_game(client)
    r = client.patch(f"/api/games/{gid}/settings", json={"remove_winner": True})
    assert r.status_code == 200 and r.json()["settings"] == {"remove_winner": True}
    err(client.patch(f"/api/games/{gid}/settings", json={}), 422, "validation_error")


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "/entries", {"names": ["A"]}),
        ("patch", "/entries/en_aaaaaaaaaa", {"name": "A"}),
        ("delete", "/entries/en_aaaaaaaaaa", None),
        ("post", "/shuffle", None),
        ("post", "/restore", None),
        ("patch", "/settings", {"remove_winner": True}),
        ("post", "/spin", None),
    ],
)
def test_unknown_game_404_everywhere(client, method, path, body):
    kw = {"json": body} if body is not None else {}
    err(getattr(client, method)(f"/api/games/zzzzzzzz{path}", **kw), 404, "game_not_found")


def test_trailing_slash_is_404(client):
    gid = new_game(client)
    r = client.get(f"/api/games/{gid}/")
    assert r.status_code == 404  # no redirect
    err(r, 404, "not_found")
    err(client.post("/api/games/"), 404, "not_found")
    err(client.get("/api/health/"), 404, "not_found")


def test_unknown_route_and_method(client):
    err(client.get("/api/nope"), 404, "not_found")
    err(client.delete("/api/games"), 405, "method_not_allowed")


def test_docs_disabled(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


# ---------------------------------------------------------------- spins
def test_spin_requires_two_entries(client):
    gid = new_game(client)
    err(client.post(f"/api/games/{gid}/spin"), 409, "not_enough_entries")
    client.post(f"/api/games/{gid}/entries", json={"names": ["Solo"]})
    err(client.post(f"/api/games/{gid}/spin"), 409, "not_enough_entries")


def test_spin_shape_and_lifecycle(client):
    gid = new_game(client, ["Anna", "Jonas", "Per"])
    r = client.post(f"/api/games/{gid}/spin")
    assert r.status_code == 202
    s = r.json()
    assert set(s) == {
        "spin_id", "winner_entry_id", "winner_name", "wheel_entry_ids", "winner_index",
        "landing_offset", "extra_rotations", "duration_ms", "started_at",
    }
    assert s["wheel_entry_ids"][s["winner_index"]] == s["winner_entry_id"]
    assert 0.08 <= s["landing_offset"] <= 0.92 and 5 <= s["extra_rotations"] <= 8
    assert 50 <= s["duration_ms"] <= 80
    assert s["started_at"].endswith("Z")
    state = client.get(f"/api/games/{gid}").json()
    assert state["current_spin"] == s
    wait_spin()
    state = client.get(f"/api/games/{gid}").json()
    assert state["current_spin"] is None
    lr = state["last_result"]
    assert lr["spin_id"] == s["spin_id"] and lr["winner_entry_id"] == s["winner_entry_id"]
    assert lr["winner_name"] == s["winner_name"] and lr["finished_at"].endswith("Z")
    assert_no_leak(state)


def test_wheel_entry_ids_are_active_in_position_order(client):
    gid = new_game(client, ["A", "B", "C", "D"])
    entries = client.get(f"/api/games/{gid}").json()["entries"]
    client.patch(f"/api/games/{gid}/entries/{entries[1]['id']}", json={"is_active": False})
    s = client.post(f"/api/games/{gid}/spin").json()
    assert s["wheel_entry_ids"] == [entries[0]["id"], entries[2]["id"], entries[3]["id"]]
    wait_spin()


def test_spin_lock_blocks_everything(client):
    gid = new_game(client, ["Anna", "Jonas"])
    eid = client.get(f"/api/games/{gid}").json()["entries"][0]["id"]
    assert client.post(f"/api/games/{gid}/spin").status_code == 202
    err(client.post(f"/api/games/{gid}/spin"), 409, "spin_in_progress")
    err(client.post(f"/api/games/{gid}/entries", json={"names": ["X"]}), 409, "spin_in_progress")
    err(client.patch(f"/api/games/{gid}/entries/{eid}", json={"name": "Y"}), 409, "spin_in_progress")
    err(client.delete(f"/api/games/{gid}/entries/{eid}"), 409, "spin_in_progress")
    err(client.post(f"/api/games/{gid}/shuffle"), 409, "spin_in_progress")
    err(client.post(f"/api/games/{gid}/restore"), 409, "spin_in_progress")
    err(client.patch(f"/api/games/{gid}/settings", json={"remove_winner": True}), 409, "spin_in_progress")
    wait_spin()
    assert client.post(f"/api/games/{gid}/entries", json={"names": ["X"]}).status_code == 200
    assert client.post(f"/api/games/{gid}/spin").status_code == 202
    wait_spin()


def test_remove_winner_applied_at_finish(client):
    gid = new_game(client, ["Anna", "Jonas", "Per"])
    client.patch(f"/api/games/{gid}/settings", json={"remove_winner": True})
    s = client.post(f"/api/games/{gid}/spin").json()
    during = {e["id"]: e for e in client.get(f"/api/games/{gid}").json()["entries"]}
    assert during[s["winner_entry_id"]]["is_active"] is True  # not before the animation ends
    wait_spin()
    after = {e["id"]: e for e in client.get(f"/api/games/{gid}").json()["entries"]}
    assert after[s["winner_entry_id"]]["is_active"] is False
    assert sum(e["is_active"] for e in after.values()) == 2


def test_remove_winner_off_keeps_winner(client):
    gid = new_game(client, ["Anna", "Jonas"])
    client.post(f"/api/games/{gid}/spin")
    wait_spin()
    assert all(e["is_active"] for e in client.get(f"/api/games/{gid}").json()["entries"])


# ---------------------------------------------------------------- secrecy
def test_public_and_link_have_identical_shape_and_no_leak(client, admin):
    names = ["Anna", "Jonas"]
    pub = new_game(client, names)
    link = new_link(admin, client, names, label="Secret", mode="always", target_names=["Jonas"])
    for gid in (pub, link):
        assert client.post(f"/api/games/{gid}/spin").status_code == 202
    a = client.get(f"/api/games/{pub}").json()
    b = client.get(f"/api/games/{link}").json()
    assert_no_leak(a)
    assert_no_leak(b)

    def shape(o):
        if isinstance(o, dict):
            return {k: shape(v) for k, v in o.items()}
        if isinstance(o, list):
            return [shape(v) for v in o]
        return type(o).__name__

    assert shape(a) == shape(b)
    wait_spin()
    a = client.get(f"/api/games/{pub}").json()
    b = client.get(f"/api/games/{link}").json()
    assert shape(a) == shape(b)
    assert "Secret" not in client.get(f"/api/games/{link}").text
