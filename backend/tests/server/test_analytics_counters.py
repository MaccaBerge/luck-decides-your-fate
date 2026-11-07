import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from app.analytics import counters
from app.services.cleanup import run_cleanup_once

from .helpers import assert_no_leak, new_game, new_link, wait_spin


def table(app) -> list[tuple]:
    with sqlite3.connect(app.state.ctx.settings.database_path) as db:
        return db.execute("SELECT day, name, value FROM daily_counters ORDER BY day, name").fetchall()


def totals(app) -> dict[str, int]:
    out: dict[str, int] = {}
    for _day, name, value in table(app):
        out[name] = out.get(name, 0) + value
    return {k: v for k, v in out.items() if v}


def sql(app, query, *params):
    with sqlite3.connect(app.state.ctx.settings.database_path) as db:
        db.execute(query, params)


def ago(**kw) -> str:
    t = datetime.now(timezone.utc) - timedelta(**kw)
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"


def today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def series(admin, mid, days=7):
    body = admin.get(f"/api/admin/analytics?days={days}").json()
    m = next(m for s in body["sections"] for m in s["metrics"] if m["id"] == mid)
    assert m["error"] is None, m
    return m["data"]


# ---------------------------------------------------------------- each counter, once
def test_wheels_created(client, app):
    assert client.post("/api/games").status_code == 201
    assert client.post("/api/games").status_code == 201
    assert totals(app) == {"wheels_created": 2}
    assert table(app) == [(today(), "wheels_created", 2)]


def test_links_created_only_on_success(client, admin, app):
    new_link(admin, label="One")
    assert client.post("/api/admin/links", json={}).status_code == 401
    assert admin.post("/api/admin/links", json={"label": "x" * 61}).status_code == 422
    assert admin.post("/api/admin/links", json={"mode": "sometimes"}).status_code == 422
    assert totals(app) == {"links_created": 1}


def test_names_added_counts_cleaned_names_and_not_failures(client, app):
    gid = new_game(client)
    assert client.post(f"/api/games/{gid}/entries", json={"names": ["A", "  ", "B", "C"]}).status_code == 200
    assert client.post(f"/api/games/{gid}/entries", json={"names": ["  "]}).status_code == 422
    assert client.post(f"/api/games/{gid}/entries", json={"names": ["x" * 41]}).status_code == 422
    assert client.post(f"/api/games/{gid}/entries", json={"names": ["N"] * 98}).status_code == 409  # over 100
    assert client.post("/api/games/nope0000/entries", json={"names": ["A"]}).status_code == 404
    assert totals(app) == {"wheels_created": 1, "names_added": 3}


def test_names_added_not_counted_on_409_during_a_spin(client, app):
    gid = new_game(client, ["A", "B"])
    assert client.post(f"/api/games/{gid}/spin").status_code == 202
    assert client.post(f"/api/games/{gid}/entries", json={"names": ["C"]}).status_code == 409
    assert client.post(f"/api/games/{gid}/spin").status_code == 409
    wait_spin()
    assert totals(app) == {"wheels_created": 1, "names_added": 2, "spins_wheels": 1}


def test_spins_by_origin_and_rule(client, admin, app):
    wheel = new_game(client, ["A", "B"])
    rigged = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Anna"])
    fair = new_link(admin, client, ["Anna", "Jonas"], mode="fair")
    for gid in (wheel, rigged, fair, rigged):
        assert client.post(f"/api/games/{gid}/spin").status_code == 202
        wait_spin()
    assert totals(app) == {
        "wheels_created": 1,
        "links_created": 2,
        "names_added": 6,
        "spins_wheels": 1,
        "spins_links": 3,
        "spins_rule_decided": 2,
    }


def test_no_spin_counted_without_enough_names(client, app):
    gid = new_game(client, ["Only"])
    assert client.post(f"/api/games/{gid}/spin").status_code == 409
    assert "spins_wheels" not in totals(app)


# ---------------------------------------------------------------- failures and secrecy
def test_failing_bump_breaks_nothing(client, admin, app, monkeypatch, caplog):
    def broken_connect():
        raise sqlite3.OperationalError("database is locked at /secret/path")

    monkeypatch.setattr(counters, "connect", broken_connect)
    gid = new_game(client, ["A", "B"])
    lid = new_link(admin, client, ["Anna", "Jonas"], mode="always", target_names=["Anna"])
    with client.websocket_connect(f"/ws/games/{lid}") as p:
        p.receive_json()
        assert client.post(f"/api/games/{lid}/spin").status_code == 202
        assert p.receive_json()["type"] == "spin_started"
        assert p.receive_json()["type"] == "spin_finished"
    assert client.post(f"/api/games/{gid}/spin").status_code == 202
    wait_spin()
    assert client.get(f"/api/games/{gid}").json()["last_result"] is not None
    assert table(app) == []
    assert "OperationalError" in caplog.text and "secret" not in caplog.text


async def test_unknown_counter_is_logged_not_raised(caplog):
    await counters.bump("visitors")
    assert "analytics counter visitors failed: ValueError" in caplog.text


def test_rule_change_bumps_nothing_and_sends_nothing_to_players(client, admin, app):
    gid = new_link(admin, client, ["Anna", "Jonas"], label="x", mode="fair")
    before = table(app)
    with client.websocket_connect(f"/ws/games/{gid}") as p:
        p.receive_json()
        admin.patch(f"/api/admin/links/{gid}", json={"mode": "always", "target_names": ["Jonas"]})
        admin.patch(f"/api/admin/links/{gid}", json={"label": "y"})
        assert admin.get("/api/admin/analytics?days=30").status_code == 200
        assert table(app) == before
        client.post(f"/api/games/{gid}/entries", json={"names": ["Marker"]})
        m = p.receive_json()
        assert m["type"] == "state" and m["state"]["entries"][-1]["name"] == "Marker"
        assert_no_leak(m)


def test_table_holds_numbers_only(client, admin, app):
    lid = new_link(admin, client, ["Anna", "Jonas"], label="Secret label", mode="always", target_names=["Anna"])
    gid = new_game(client, ["Mia", "Leo"])
    for g in (lid, gid):
        client.post(f"/api/games/{g}/spin")
        wait_spin()
    rows = table(app)
    assert rows
    for day, name, value in rows:
        datetime.strptime(day, "%Y-%m-%d")
        assert name in counters.ALL
        assert isinstance(value, int)
    dump = repr(rows)
    for secret in ("Anna", "Jonas", "Mia", "Leo", "Secret", lid, gid):
        assert secret not in dump


# ---------------------------------------------------------------- series
def test_series_fill_missing_days_with_zeros(admin, app):
    data = series(admin, "spins_per_day")
    assert [p["value"] for p in data["points"]] == [0] * 7
    assert data["hint"] == "No data yet"

    three_ago = (datetime.now(timezone.utc).date() - timedelta(days=3))
    sql(app, "INSERT INTO daily_counters VALUES (?, 'spins_wheels', 4)", three_ago.isoformat())
    sql(app, "INSERT INTO daily_counters VALUES (?, 'spins_links', 2)", three_ago.isoformat())
    sql(app, "INSERT INTO daily_counters VALUES (?, 'spins_links', 1)", today())
    sql(app, "INSERT INTO daily_counters VALUES (?, 'spins_rule_decided', 9)", today())  # not a spin total
    data = series(admin, "spins_per_day")
    assert [p["value"] for p in data["points"]] == [0, 0, 0, 6, 0, 0, 1]
    assert data["points"][-1]["day"] == today()
    assert data["hint"] == f"Since {three_ago:%b} {three_ago.day}, {three_ago.year}"


def test_series_range_limits(admin, app):
    old = datetime.now(timezone.utc).date() - timedelta(days=40)
    sql(app, "INSERT INTO daily_counters VALUES (?, 'names_added', 5)", old.isoformat())
    assert sum(p["value"] for p in series(admin, "names_added_per_day", 30)["points"]) == 0
    points = series(admin, "names_added_per_day", 90)["points"]
    assert len(points) == 90 and sum(p["value"] for p in points) == 5
    assert series(admin, "names_added_per_day", 30)["hint"] == f"Since {old:%b} {old.day}, {old.year}"


# ---------------------------------------------------------------- survives cleanup
def test_totals_survive_the_cleanup(client, app):
    gid = new_game(client, ["A", "B", "C"])
    assert client.post(f"/api/games/{gid}/spin").status_code == 202
    wait_spin()
    before = table(app)
    assert totals(app) == {"wheels_created": 1, "names_added": 3, "spins_wheels": 1}

    sql(app, "UPDATE games SET last_activity_at = ? WHERE id = ?", ago(days=8), gid)
    deleted = client.portal.call(run_cleanup_once, app.state.ctx)
    assert deleted == [gid]
    assert client.get(f"/api/games/{gid}").status_code == 404
    assert table(app) == before


@pytest.mark.parametrize("name", counters.ALL)
def test_every_counter_name_is_short_and_plain(name):
    assert name.replace("_", "").isalpha() and len(name) <= 32
