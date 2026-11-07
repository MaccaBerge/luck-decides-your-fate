"""Part 3: the `visits` and `active_seconds` counters, recorded by player sockets only."""
import sqlite3
import time

import pytest

from app.analytics import counters
from app.routes import ws as ws_route

from .helpers import assert_no_leak, new_game, new_link


def totals(app) -> dict[str, int]:
    with sqlite3.connect(app.state.ctx.settings.database_path) as db:
        found = db.execute(
            "SELECT name, SUM(value) FROM daily_counters WHERE name IN ('visits', 'active_seconds')"
            " GROUP BY name"
        ).fetchall()
    return dict(found)


def settle(app, expected: dict[str, int]) -> None:
    """The close is recorded just after the client sees it, so wait briefly for it."""
    deadline = time.monotonic() + 2
    while totals(app) != expected and time.monotonic() < deadline:
        time.sleep(0.02)
    assert totals(app) == expected


@pytest.fixture
def clock(monkeypatch):
    """A fake monotonic clock for the player socket: set `clock.now` to move time."""

    class Clock:
        now = 1000.0

    monkeypatch.setattr(ws_route, "monotonic", lambda: Clock.now)
    return Clock


def series_total(admin, mid, days=7):
    body = admin.get(f"/api/admin/analytics?days={days}").json()
    m = next(m for s in body["sections"] for m in s["metrics"] if m["id"] == mid)
    assert m["error"] is None, m
    return m["data"]


# ---------------------------------------------------------------- visits
def test_first_connection_counts_a_visit_and_its_time(client, app, clock):
    gid = new_game(client)
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        assert p.receive_json()["type"] == "state"
        clock.now += 95.4
    settle(app, {"visits": 1, "active_seconds": 95})


def test_resume_connection_counts_time_but_no_visit(client, app, clock):
    gid = new_game(client)
    with client.websocket_connect(f"/ws/games/{gid}?resume=1") as p:
        assert p.receive_json()["type"] == "state"
        clock.now += 30
    settle(app, {"active_seconds": 30})


def test_hide_and_return_is_one_visit(client, app, clock):
    gid = new_game(client)
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        clock.now += 60
    settle(app, {"visits": 1, "active_seconds": 60})
    clock.now += 600  # hidden: no socket, so no time
    for _ in range(2):
        with client.websocket_connect(f"/ws/games/{gid}?resume=1") as p:
            p.receive_json()
            clock.now += 20
    settle(app, {"visits": 1, "active_seconds": 100})


@pytest.mark.parametrize("query", ["?resume=0", "?resume=true", "?resume="])
def test_only_resume_1_skips_the_visit(client, app, clock, query):
    gid = new_game(client)
    with client.websocket_connect(f"/ws/games/{gid}{query}") as p:
        p.receive_json()
    settle(app, {"visits": 1, "active_seconds": 0})


def test_unknown_game_counts_nothing(client, app):
    with client.websocket_connect("/ws/games/nope0000") as p:
        with pytest.raises(Exception):
            p.receive_json()
    time.sleep(0.1)
    assert totals(app) == {}


def test_admin_and_dashboard_sockets_count_nothing(admin, app, clock):
    lid = new_link(admin, names=["Anna", "Jonas"])
    with admin.websocket_connect(f"/ws/admin/games/{lid}") as a, admin.websocket_connect("/ws/admin") as d:
        a.receive_json()
        d.receive_json()
        clock.now += 500
    time.sleep(0.1)
    assert totals(app) == {}


# ---------------------------------------------------------------- the 2-hour cap
def test_time_is_capped_at_two_hours_per_connection(client, app, clock):
    gid = new_game(client)
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        clock.now += 3 * 60 * 60
    settle(app, {"visits": 1, "active_seconds": 7200})


def test_cap_never_touches_the_connection(client, app, clock):
    gid = new_game(client, ["Anna", "Jonas"])
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        clock.now += 3 * 60 * 60  # well past the cap: the socket keeps working as before
        assert client.post(f"/api/games/{gid}/entries", json={"names": ["Mia"]}).status_code == 200
        state = p.receive_json()
        assert state["type"] == "state" and state["state"]["entries"][-1]["name"] == "Mia"
        assert client.post(f"/api/games/{gid}/spin").status_code == 202
        assert p.receive_json()["type"] == "spin_started"
        assert p.receive_json()["type"] == "spin_finished"
        assert p.receive_json()["type"] == "state"
        clock.now += 60 * 60
    settle(app, {"visits": 1, "active_seconds": 7200})


@pytest.mark.parametrize("started, ended, expected", [(10, 9, 0), (0, 0.4, 0), (0, 0.6, 1), (0, 7200.4, 7200), (0, 10**6, 7200)])
def test_active_seconds(started, ended, expected):
    assert counters.active_seconds(started, ended) == expected


# ---------------------------------------------------------------- failures, shutdown, secrecy
def test_failing_bump_does_not_break_the_socket(client, app, monkeypatch, caplog):
    def broken_connect():
        raise sqlite3.OperationalError("disk I/O error at /secret/path")

    monkeypatch.setattr(counters, "connect", broken_connect)
    gid = new_game(client, ["Anna", "Jonas"])
    for query in ("", "?resume=1"):
        with client.websocket_connect(f"/ws/games/{gid}{query}") as p:
            assert p.receive_json()["type"] == "state"
            assert client.post(f"/api/games/{gid}/entries", json={"names": ["Mia" + query[-1:]]}).status_code == 200
            assert p.receive_json()["type"] == "state"
    time.sleep(0.1)
    assert client.get(f"/api/games/{gid}").status_code == 200
    assert "OperationalError" in caplog.text and "secret" not in caplog.text
    monkeypatch.undo()
    assert totals(app) == {}


def test_close_during_shutdown_is_recorded(client, app, clock):
    gid = new_game(client)
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        clock.now += 42
        client.portal.call(app.state.ctx.manager.close_all)  # what shutdown does (close code 1012)
        with pytest.raises(Exception):
            p.receive_json()
    settle(app, {"visits": 1, "active_seconds": 42})


def test_rule_change_sends_nothing_to_a_counted_player(client, admin, app, clock):
    gid = new_link(admin, client, ["Anna", "Jonas"], label="x", mode="fair")
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        admin.patch(f"/api/admin/links/{gid}", json={"mode": "always", "target_names": ["Jonas"]})
        admin.patch(f"/api/admin/links/{gid}", json={"label": "y"})
        assert totals(app) == {}  # counted when the socket closes, never on a rule change
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]})
        m = p.receive_json()
        assert m["type"] == "state" and m["state"]["entries"][-1]["name"] == "Marker"
        assert_no_leak(m)
    settle(app, {"visits": 1, "active_seconds": 0})


def test_resume_still_marks_opened_and_shows_presence(client, admin):
    lid = new_link(admin, client, ["Anna", "Jonas"], label="One")
    with admin.websocket_connect(f"/ws/admin/games/{lid}") as a:
        assert a.receive_json()["state"]["link"]["status"] == "created"
        with client.websocket_connect(f"/ws/games/{lid}?resume=1") as p:
            p.receive_json()
            assert a.receive_json()["state"]["link"]["status"] == "connected"
        assert a.receive_json()["state"]["link"]["status"] == "disconnected"


# ---------------------------------------------------------------- metrics
def test_visit_metrics(client, admin, app, clock):
    empty = series_total(admin, "active_time_per_visit")
    assert empty == {"value": 0, "hint": "0 visits · No data yet", "format": "duration"}
    assert series_total(admin, "spins_per_visit")["value"] == 0

    gid = new_game(client, ["Anna", "Jonas"])
    for seconds in (100, 50):
        with client.websocket_connect(f"/ws/games/{gid}") as p:
            p.receive_json()
            clock.now += seconds
    with client.websocket_connect(f"/ws/games/{gid}?resume=1") as p:
        p.receive_json()
        clock.now += 150
    settle(app, {"visits": 2, "active_seconds": 300})
    for _ in range(3):
        assert client.post(f"/api/games/{gid}/spin").status_code == 202
        time.sleep(0.7)

    data = series_total(admin, "active_time_per_visit")
    assert data["value"] == 150 and data["format"] == "duration"
    assert data["hint"].startswith("2 visits · Since ")
    assert series_total(admin, "spins_per_visit")["value"] == 1.5
    assert series_total(admin, "spins_per_visit")["hint"].startswith("3 spins · Since ")
    assert series_total(admin, "visits_per_day")["points"][-1]["value"] == 2
    assert series_total(admin, "active_minutes_per_day")["points"][-1]["value"] == 5
