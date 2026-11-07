import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from app.analytics import registry as reg

from .helpers import assert_no_leak, new_game, new_link, wait_spin

# Top-level keys of the analytics report. ("kind" isn't one: public state has its own kind, solo/multiplayer.)
ANALYTICS_KEYS = {"sections", "metrics", "generated_at"}


def ago(**kw) -> str:
    t = datetime.now(timezone.utc) - timedelta(**kw)
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"


def sql(app, query, *params):
    with sqlite3.connect(app.state.ctx.settings.database_path) as db:
        db.execute(query, params)


def add_spin(app, gid, *, started_at, rule_applied, finished=True):
    sql(
        app,
        "INSERT INTO spins (game_id, winner_entry_id, winner_name, mode, rule_applied, started_at,"
        " finished_at) VALUES (?, 'e', 'x', 'fair', ?, ?, ?)",
        gid, 1 if rule_applied else 0, started_at, started_at if finished else None,
    )


def metrics(admin, days=None):
    r = admin.get("/api/admin/analytics" + (f"?days={days}" if days else ""))
    assert r.status_code == 200, r.text
    return {m["id"]: m for s in r.json()["sections"] for m in s["metrics"]}


def value(ms, mid):
    assert ms[mid]["error"] is None, ms[mid]
    return ms[mid]["data"]["value"]


# ---------------------------------------------------------------- endpoint
def test_requires_admin_cookie(client):
    r = client.get("/api/admin/analytics")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


@pytest.mark.parametrize("days", ["8", "0", "abc", "7.5", "-7"])
def test_bad_days_is_422_envelope(admin, days):
    r = admin.get(f"/api/admin/analytics?days={days}")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


@pytest.mark.parametrize("days", [7, 30, 90])
def test_report_shape(admin, days):
    body = admin.get(f"/api/admin/analytics?days={days}").json()
    assert body["days"] == days
    assert body["generated_at"].endswith("Z")
    assert [s["id"] for s in body["sections"]] == ["now", "history", "visits", "wheels", "links", "per_link"]
    for s in body["sections"]:
        assert s["title"]
        for m in s["metrics"]:
            assert set(m) == {"id", "title", "description", "kind", "data", "error"}
            assert m["description"] and m["error"] is None


def test_default_range_is_7_days(admin):
    assert admin.get("/api/admin/analytics").json()["days"] == 7


def test_one_failing_metric_does_not_break_the_others(admin, monkeypatch, caplog):
    r = reg.Registry()
    section = reg.Section("s", "S")

    @r.metric(id="fine", title="Fine", description="d", section=section, kind="number")
    async def fine(ctx):
        return {"value": ctx.days}

    @r.metric(id="broken", title="Broken", description="d", section=section, kind="number")
    async def broken(ctx):
        raise KeyError("Anna is the target")

    monkeypatch.setattr(reg, "default_registry", r)
    res = admin.get("/api/admin/analytics?days=30")
    assert res.status_code == 200
    ms = {m["id"]: m for s in res.json()["sections"] for m in s["metrics"]}
    assert ms["fine"]["data"] == {"value": 30, "hint": None, "format": None}
    assert ms["broken"]["error"] == "KeyError" and ms["broken"]["data"] is None
    assert "Anna" not in res.text and "Anna" not in caplog.text


# ---------------------------------------------------------------- metrics
def test_empty_database(admin):
    ms = metrics(admin)
    for mid in ("live_games", "players_now", "wheels_stored", "wheels_used", "links_created",
                "links_opened", "link_spins", "rule_decided"):
        assert value(ms, mid) == 0, mid
    assert ms["avg_names"]["data"] == {"value": 0, "hint": "No wheels stored", "format": None}
    assert ms["rule_decided"]["data"]["hint"] is None
    assert ms["per_link_spins"]["data"] == {"columns": ["Label", "Status", "Spins", "Rule decided"], "rows": []}


def test_presence_counts_players_not_admins(client, admin):
    gid = new_game(client, ["A", "B"])
    lid = new_link(admin, client, ["Anna", "Jonas"], label="One")
    with client.websocket_connect(f"/ws/games/{gid}") as p1, \
            client.websocket_connect(f"/ws/games/{lid}") as p2, \
            client.websocket_connect(f"/ws/games/{lid}") as p3, \
            admin.websocket_connect(f"/ws/admin/games/{lid}") as a, \
            admin.websocket_connect("/ws/admin") as d:
        for ws in (p1, p2, p3, a, d):
            ws.receive_json()
        ms = metrics(admin)
        assert value(ms, "live_games") == 2
        assert value(ms, "players_now") == 3
        assert ms["per_link_spins"]["data"]["rows"] == [["One", "Connected", 0, 0]]
    ms = metrics(admin)
    assert value(ms, "players_now") == 0
    assert ms["per_link_spins"]["data"]["rows"] == [["One", "Disconnected", 0, 0]]


def test_stored_wheels(client, admin, app):
    recent = new_game(client, ["A", "B", "C"])
    old = new_game(client, ["D"])
    new_game(client)  # no names
    new_link(admin, client, ["Not", "Counted", "Here"])
    sql(app, "UPDATE games SET last_activity_at = ? WHERE id = ?", ago(days=10), old)
    sql(app, "UPDATE games SET last_activity_at = ? WHERE id = ?", ago(days=40), recent)
    ms7, ms30, ms90 = metrics(admin, 7), metrics(admin, 30), metrics(admin, 90)
    assert value(ms7, "wheels_stored") == 3
    assert [value(m, "wheels_used") for m in (ms7, ms30, ms90)] == [1, 2, 3]
    assert ms7["avg_names"]["data"] == {"value": 1.3, "hint": "Across 3 wheels", "format": None}


def test_links_and_rule_spins_by_range(client, admin, app):
    one = new_link(admin, client, ["Anna", "Jonas"], label="One", mode="always", target_names=["Anna"])
    two = new_link(admin)
    sql(app, "UPDATE games SET created_at = ? WHERE id = ?", ago(days=40), two)
    sql(app, "UPDATE games SET first_opened_at = ? WHERE id = ?", ago(hours=1), one)

    # Two real spins through the API: the rule decides both.
    for _ in range(2):
        assert client.post(f"/api/games/{one}/spin").status_code == 202
        wait_spin()
    add_spin(app, one, started_at=ago(hours=2), rule_applied=False)
    add_spin(app, one, started_at=ago(days=20), rule_applied=True)
    add_spin(app, two, started_at=ago(days=60), rule_applied=False)
    add_spin(app, one, started_at=ago(seconds=5), rule_applied=True, finished=False)  # in progress
    # Ordinary wheels never count as link spins.
    wheel = new_game(client, ["A", "B"])
    add_spin(app, wheel, started_at=ago(hours=1), rule_applied=False)

    ms7, ms30, ms90 = metrics(admin, 7), metrics(admin, 30), metrics(admin, 90)
    assert ms7["links_created"]["data"] == {"value": 2, "hint": "1 in range", "format": None}
    assert ms90["links_created"]["data"] == {"value": 2, "hint": "2 in range", "format": None}
    assert ms7["links_opened"]["data"] == {"value": 1, "hint": "Of 2", "format": None}
    assert [value(m, "link_spins") for m in (ms7, ms30, ms90)] == [3, 4, 5]
    assert ms7["rule_decided"]["data"] == {"value": 2, "hint": "67% of link spins", "format": None}
    assert ms30["rule_decided"]["data"] == {"value": 3, "hint": "75% of link spins", "format": None}
    assert ms90["per_link_spins"]["data"]["rows"] == [
        ["One", "Disconnected", 4, 3],
        ["Untitled", "Created", 1, 0],
    ]
    assert ms7["per_link_spins"]["data"]["rows"][1] == ["Untitled", "Created", 0, 0]


def test_range_starts_at_midnight_utc(client, admin, app):
    gid = new_link(admin)
    first_day = datetime.now(timezone.utc).date() - timedelta(days=6)
    add_spin(app, gid, started_at=f"{first_day.isoformat()}T00:00:00.000Z", rule_applied=True)
    add_spin(app, gid, started_at=f"{(first_day - timedelta(days=1)).isoformat()}T23:59:59.999Z", rule_applied=True)
    assert value(metrics(admin, 7), "link_spins") == 1
    assert value(metrics(admin, 30), "link_spins") == 2


# ---------------------------------------------------------------- secrecy
def test_nothing_reaches_players_or_public_state(client, admin):
    gid = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Anna"])
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        for days in (7, 30, 90):
            assert admin.get(f"/api/admin/analytics?days={days}").status_code == 200
        # The next player message must be the state for this public change, nothing before it.
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]})
        m = p.receive_json()
        assert m["type"] == "state"
        assert [e["name"] for e in m["state"]["entries"]][-1] == "Marker"
        assert_no_leak(m)
        assert not ANALYTICS_KEYS & set(m["state"])
    state = client.get(f"/api/games/{gid}").json()
    assert not ANALYTICS_KEYS & set(state)
    assert "analytics" not in client.get("/robots.txt").text
