"""Multiplayer games (multiplayer plan, part 2a): hosting, joining, permissions, presence."""
import asyncio
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone

import aiosqlite
import pytest

from app.db.connection import init_db
from app.db.ids import JOIN_CODE_ALPHABET
from app.services import players as players_service
from app.services import tickets as tickets_module

from .helpers import assert_no_leak, keys_deep, new_game, new_link, wait_spin


def tok(token: str) -> dict:
    return {"X-Player-Token": token}


def host(client, gid, name="Hanna", avatar="fox"):
    r = client.post(f"/api/games/{gid}/host", json={"name": name, "avatar": avatar})
    assert r.status_code == 201, r.text
    return r.json()


def join(client, gid, name, avatar="cat"):
    r = client.post(f"/api/games/{gid}/players", json={"name": name, "avatar": avatar})
    assert r.status_code == 201, r.text
    return r.json()


def lobby(client, names=("Anna", "Jonas")):
    """A multiplayer game with a host (Hanna) and two players. Returns (gid, host, [players])."""
    gid = new_game(client)
    h = host(client, gid)
    ps = [join(client, gid, n) for n in names]
    return gid, h, ps


def state(client, gid):
    return client.get(f"/api/games/{gid}").json()


def ticket(client, gid, token):
    r = client.post(f"/api/games/{gid}/socket-ticket", headers=tok(token))
    assert r.status_code == 200, r.text
    return r.json()["ticket"]


def statuses(s) -> dict[str, str]:
    return {p["name"]: p["status"] for p in s["players"]}


def db_rows(app, query, *params):
    with sqlite3.connect(app.state.ctx.settings.database_path) as db:
        return db.execute(query, params).fetchall()


# ---------------------------------------------------------------- hosting and joining
def test_hosting_makes_a_solo_wheel_multiplayer(client):
    gid = new_game(client, ["Anna", "Jonas"])
    body = host(client, gid, "Hanna", "wizard")
    s = body["state"]
    assert s["kind"] == "multiplayer"
    assert re.fullmatch(f"[{JOIN_CODE_ALPHABET}]{{6}}", s["join_code"])
    assert [e["name"] for e in s["entries"]] == ["Anna", "Jonas", "Hanna"]  # names typed so far stay
    (p,) = s["players"]
    assert p == {"id": body["player_id"], "entry_id": s["entries"][2]["id"], "name": "Hanna",
                 "avatar": "wizard", "status": "away", "is_host": True}
    assert len(body["player_token"]) >= 40
    assert state(client, gid)["join_code"] == s["join_code"]

    r = client.post(f"/api/games/{gid}/host", json={"name": "Again", "avatar": "fox"}, headers=tok(body["player_token"]))
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_multiplayer"


def test_join_by_code(client):
    gid, h, _ = lobby(client, ())
    code = h["state"]["join_code"]
    for typed in (code, code.lower(), f"  {code} "):
        r = client.get(f"/api/join/{typed}")
        assert r.status_code == 200 and r.json() == {"game_id": gid}
    for bad in ("ZZZZZZ", "ABC", "toolongcode"):
        r = client.get(f"/api/join/{bad}")
        assert r.status_code == 404 and r.json()["error"]["code"] == "code_not_found"

    p = join(client, gid, "Anna", "robot")
    assert [(x["name"], x["avatar"], x["is_host"]) for x in p["state"]["players"]] == [
        ("Hanna", "fox", True), ("Anna", "robot", False)]


def test_join_errors(client):
    solo = new_game(client)
    r = client.post(f"/api/games/{solo}/players", json={"name": "Anna", "avatar": "cat"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_multiplayer"
    gid, _, _ = lobby(client, ())
    for body in ({"name": "Anna", "avatar": "dragon"}, {"name": "  ", "avatar": "cat"},
                 {"name": "x" * 41, "avatar": "cat"}):
        r = client.post(f"/api/games/{gid}/players", json=body)
        assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error", body
    assert client.post("/api/games/nope0000/players", json={"name": "A", "avatar": "cat"}).status_code == 404


def test_join_respects_the_name_limit(client):
    gid = new_game(client, [f"N{i}" for i in range(99)])
    h = host(client, gid)  # the 100th name
    r = client.post(f"/api/games/{gid}/players", json={"name": "Late", "avatar": "cat"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "entries_limit"
    assert len(state(client, gid)["entries"]) == 100 and h


def test_join_during_a_spin_is_409(client):
    gid, h, _ = lobby(client)
    assert client.post(f"/api/games/{gid}/spin", headers=tok(h["player_token"])).status_code == 202
    r = client.post(f"/api/games/{gid}/players", json={"name": "Late", "avatar": "cat"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "spin_in_progress"
    wait_spin()


# ---------------------------------------------------------------- permissions
def test_only_the_host_controls_a_multiplayer_game(client):
    gid, h, (anna, _) = lobby(client)
    eid = h["state"]["entries"][0]["id"]
    actions = [
        ("post", f"/api/games/{gid}/entries", {"names": ["X"]}),
        ("patch", f"/api/games/{gid}/entries/{eid}", {"name": "Renamed"}),
        ("post", f"/api/games/{gid}/shuffle", None),
        ("post", f"/api/games/{gid}/restore", None),
        ("patch", f"/api/games/{gid}/settings", {"remove_winner": True}),
        ("post", f"/api/games/{gid}/spin", None),
        ("delete", f"/api/games/{gid}/entries/{eid}", None),
    ]
    for headers in ({}, tok(anna["player_token"]), tok("not-a-real-key")):
        for method, url, body in actions:
            kw = {"headers": headers} | ({"json": body} if body is not None else {})
            r = getattr(client, method)(url, **kw)
            assert r.status_code == 403 and r.json()["error"]["code"] == "not_host", (method, url, headers)
    for method, url, body in actions[:-2]:
        kw = {"headers": tok(h["player_token"])} | ({"json": body} if body is not None else {})
        assert getattr(client, method)(url, **kw).status_code == 200, url
    assert client.post(f"/api/games/{gid}/spin", headers=tok(h["player_token"])).status_code == 202
    wait_spin()


def test_solo_wheels_stay_open(client):
    gid = new_game(client, ["Anna", "Jonas"])
    assert client.post(f"/api/games/{gid}/spin").status_code == 202
    wait_spin()
    assert client.post(f"/api/games/{gid}/shuffle", headers=tok("anything")).status_code == 200


def test_a_key_only_works_in_its_own_game(client):
    gid1, h1, _ = lobby(client, ())
    gid2, _, _ = lobby(client, ())
    r = client.post(f"/api/games/{gid2}/shuffle", headers=tok(h1["player_token"]))
    assert r.status_code == 403
    r = client.post(f"/api/games/{gid2}/socket-ticket", headers=tok(h1["player_token"]))
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_a_player"
    assert gid1


# ---------------------------------------------------------------- leaving, removing, the host role
def test_leaving_removes_the_player_and_their_name(client):
    gid, _, (anna, jonas) = lobby(client)
    r = client.delete(f"/api/games/{gid}/players/me", headers=tok(anna["player_token"]))
    assert r.status_code == 200
    s = r.json()
    assert [p["name"] for p in s["players"]] == ["Hanna", "Jonas"]
    assert "Anna" not in [e["name"] for e in s["entries"]]
    r = client.delete(f"/api/games/{gid}/players/me", headers=tok(anna["player_token"]))
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_a_player"
    assert jonas


def test_host_role_passes_to_the_earliest_player_who_is_here(client):
    gid, h, (anna, jonas) = lobby(client)
    with client.websocket_connect(f"/ws/games/{gid}?ticket={ticket(client, gid, jonas['player_token'])}") as ws:
        ws.receive_json()
        r = client.delete(f"/api/games/{gid}/players/me", headers=tok(h["player_token"]))
        hosts = [p["name"] for p in r.json()["players"] if p["is_host"]]
        assert hosts == ["Jonas"]  # Anna joined first but is away
    r = client.delete(f"/api/games/{gid}/players/me", headers=tok(jonas["player_token"]))
    assert [p["name"] for p in r.json()["players"] if p["is_host"]] == ["Anna"]  # nobody here: earliest
    r = client.delete(f"/api/games/{gid}/players/me", headers=tok(anna["player_token"]))
    assert r.json()["players"] == []
    # An empty game: the next person to join becomes host.
    assert join(client, gid, "Mia")["state"]["players"][0]["is_host"] is True


def test_host_removes_a_player(client):
    gid, h, (anna, jonas) = lobby(client)
    r = client.delete(f"/api/games/{gid}/players/{anna['player_id']}", headers=tok(jonas["player_token"]))
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_host"
    r = client.delete(f"/api/games/{gid}/players/{anna['player_id']}", headers=tok(h["player_token"]))
    assert r.status_code == 200 and [p["name"] for p in r.json()["players"]] == ["Hanna", "Jonas"]
    r = client.delete(f"/api/games/{gid}/players/{anna['player_id']}", headers=tok(h["player_token"]))
    assert r.status_code == 404 and r.json()["error"]["code"] == "player_not_found"
    # Anna's old key no longer works.
    assert client.post(f"/api/games/{gid}/socket-ticket", headers=tok(anna["player_token"])).status_code == 403


def test_deleting_a_players_name_removes_the_player(client):
    gid, h, (anna, _) = lobby(client)
    r = client.delete(f"/api/games/{gid}/entries/{anna['state']['players'][1]['entry_id']}",
                      headers=tok(h["player_token"]))
    assert r.status_code == 200 and "Anna" not in [p["name"] for p in r.json()["players"]]
    # The host deleting their own name hands the host role on.
    host_entry = r.json()["players"][0]["entry_id"]
    r = client.delete(f"/api/games/{gid}/entries/{host_entry}", headers=tok(h["player_token"]))
    assert [(p["name"], p["is_host"]) for p in r.json()["players"]] == [("Jonas", True)]


def test_leaving_during_a_spin_is_409(client):
    gid, h, (anna, _) = lobby(client)
    assert client.post(f"/api/games/{gid}/spin", headers=tok(h["player_token"])).status_code == 202
    r = client.delete(f"/api/games/{gid}/players/me", headers=tok(anna["player_token"]))
    assert r.status_code == 409 and r.json()["error"]["code"] == "spin_in_progress"
    wait_spin()


# ---------------------------------------------------------------- keys and tickets
def test_keys_are_stored_hashed_and_never_returned_again(client, app):
    gid, h, (anna, _) = lobby(client)
    stored = [r[0] for r in db_rows(app, "SELECT token_hash FROM players")]
    assert len(stored) == 3 and all(re.fullmatch("[0-9a-f]{64}", t) for t in stored)
    dump = repr(db_rows(app, "SELECT * FROM players")) + client.get(f"/api/games/{gid}").text
    for key in (h["player_token"], anna["player_token"]):
        assert key not in dump
    assert "token" not in keys_deep(state(client, gid))


def test_tickets_are_single_use_and_expire(client, monkeypatch):
    gid, h, _ = lobby(client, ())
    t = ticket(client, gid, h["player_token"])
    store = client.app.state.ctx.tickets
    assert store.consume("othergame", t) is None  # wrong game uses it up too
    t = ticket(client, gid, h["player_token"])
    assert store.consume(gid, t) == h["player_id"]
    assert store.consume(gid, t) is None
    t = ticket(client, gid, h["player_token"])
    later = time.monotonic() + tickets_module.TICKET_TTL_S + 1
    monkeypatch.setattr(tickets_module.time, "monotonic", lambda: later)
    assert store.consume(gid, t) is None


def test_ticket_needs_a_player_key(client):
    gid, _, _ = lobby(client, ())
    r = client.post(f"/api/games/{gid}/socket-ticket")
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_a_player"


# ---------------------------------------------------------------- presence
def test_players_show_here_and_away_live(client):
    gid, h, (anna, _) = lobby(client)
    with client.websocket_connect(f"/ws/games/{gid}") as tv:  # no ticket: just watching
        assert statuses(tv.receive_json()["state"]) == {"Hanna": "away", "Anna": "away", "Jonas": "away"}
        with client.websocket_connect(f"/ws/games/{gid}?ticket={ticket(client, gid, anna['player_token'])}") as a:
            assert statuses(tv.receive_json()["state"])["Anna"] == "here"
            assert statuses(a.receive_json()["state"])["Anna"] == "here"
        m = tv.receive_json()
        assert m["type"] == "state" and statuses(m["state"])["Anna"] == "away"
    assert h


def test_a_used_or_invalid_ticket_just_watches(client):
    gid, h, _ = lobby(client, ())
    t = ticket(client, gid, h["player_token"])
    with client.websocket_connect(f"/ws/games/{gid}?ticket={t}") as a:
        assert statuses(a.receive_json()["state"]) == {"Hanna": "here"}
    for bad in (t, "made-up"):
        with client.websocket_connect(f"/ws/games/{gid}?ticket={bad}") as w:
            assert statuses(w.receive_json()["state"])["Hanna"] == "away"


def test_sweep_removes_players_away_for_ten_minutes(client, app):
    gid, h, (anna, jonas) = lobby(client)
    ctx = app.state.ctx
    soon = datetime.now(timezone.utc) + timedelta(minutes=9)
    assert client.portal.call(players_service.sweep_once, ctx, soon) == []
    later = datetime.now(timezone.utc) + timedelta(minutes=11)
    with client.websocket_connect(f"/ws/games/{gid}?ticket={ticket(client, gid, jonas['player_token'])}") as j:
        j.receive_json()
        removed = client.portal.call(players_service.sweep_once, ctx, later)
        assert set(removed) == {h["player_id"], anna["player_id"]}  # Jonas is here
        s = j.receive_json()["state"]
        assert [(p["name"], p["is_host"]) for p in s["players"]] == [("Jonas", True)]
        assert [e["name"] for e in s["entries"]] == ["Jonas"]


def test_sweep_waits_for_a_spin_to_finish(client, app):
    gid, h, (anna, _) = lobby(client)
    later = datetime.now(timezone.utc) + timedelta(minutes=11)
    assert client.post(f"/api/games/{gid}/spin", headers=tok(h["player_token"])).status_code == 202
    assert client.portal.call(players_service.sweep_once, app.state.ctx, later) == []
    wait_spin()
    assert len(client.portal.call(players_service.sweep_once, app.state.ctx, later)) == 3
    assert anna


# ---------------------------------------------------------------- secrecy
def test_a_controller_link_and_a_wheel_look_the_same_once_hosted(client, admin):
    wheel = new_game(client, ["Anna", "Jonas"])
    link = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Jonas"], label="Secret")
    results = {}
    for gid in (wheel, link):
        h = host(client, gid)
        p = join(client, gid, "Mia")
        forbidden = client.post(f"/api/games/{gid}/spin", headers=tok(p["player_token"]))
        allowed = client.post(f"/api/games/{gid}/spin", headers=tok(h["player_token"]))
        wait_spin()
        s = state(client, gid)
        assert_no_leak(s)
        assert_no_leak(h)
        results[gid] = (keys_deep(s), keys_deep(h), forbidden.status_code, forbidden.json(),
                        allowed.status_code, sorted(allowed.json()))
    assert results[wheel] == results[link]


def test_rule_change_sends_nothing_to_players_in_a_multiplayer_game(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="fair")
    h = host(client, gid)
    with client.websocket_connect(f"/ws/games/{gid}?ticket={ticket(client, gid, h['player_token'])}") as p:
        p.receive_json()
        admin.patch(f"/api/admin/links/{gid}", json={"mode": "always", "target_names": ["Jonas"]})
        admin.patch(f"/api/admin/links/{gid}", json={"label": "x"})
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]}, headers=tok(h["player_token"]))
        m = p.receive_json()
        assert m["type"] == "state" and m["state"]["entries"][-1]["name"] == "Marker"
        assert_no_leak(m)


def test_rigging_still_applies_in_a_multiplayer_game(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas", "Mia"], mode="always", target_names=["Jonas"])
    h = host(client, gid)
    for _ in range(3):
        r = client.post(f"/api/games/{gid}/spin", headers=tok(h["player_token"]))
        assert r.json()["winner_name"] == "Jonas"
        wait_spin()


# ---------------------------------------------------------------- migration
def test_old_databases_get_the_new_columns(tmp_path):
    path = tmp_path / "old.db"
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE games (id TEXT PRIMARY KEY, game_type TEXT NOT NULL DEFAULT 'wheel',"
            " origin TEXT NOT NULL, label TEXT, mode TEXT NOT NULL DEFAULT 'fair',"
            " target_names TEXT NOT NULL DEFAULT '[]', remove_winner INTEGER NOT NULL DEFAULT 0,"
            " created_at TEXT NOT NULL, first_opened_at TEXT, last_activity_at TEXT NOT NULL)"
        )
        db.execute("INSERT INTO games (id, origin, created_at, last_activity_at) VALUES ('old00000', 'public', 'x', 'x')")

    async def run():
        await init_db(str(path))
        await init_db(str(path))  # running twice is fine
        async with aiosqlite.connect(path) as db:
            async with db.execute("SELECT kind, join_code FROM games") as cur:
                return await cur.fetchall()

    assert asyncio.run(run()) == [("solo", None)]
    with sqlite3.connect(path) as db:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        indexes = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert "players" in tables and "idx_games_join_code" in indexes


@pytest.mark.parametrize("avatar", players_service.AVATARS)
def test_every_avatar_is_accepted(client, avatar):
    gid = new_game(client)
    assert host(client, gid, avatar=avatar)["state"]["players"][0]["avatar"] == avatar
