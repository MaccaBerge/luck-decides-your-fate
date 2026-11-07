from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.analytics import registry as reg
from app.analytics.report import build_report
from app.models import NumberData, SeriesData

NOW = datetime(2026, 11, 7, 15, 30, tzinfo=timezone.utc)
A = reg.Section("a", "Section A")
B = reg.Section("b", "Section B")


async def _value(ctx):
    return {"value": 1}


def _ctx(days=7):
    return reg.MetricContext(app=None, days=days, now=NOW)  # type: ignore[arg-type]


def _metric(kind):
    return reg.Metric("m", "M", "d", A, kind, _value)


def test_registration_order_is_display_order():
    r = reg.Registry()
    for mid, section in [("one", A), ("two", B), ("three", A)]:
        r.metric(id=mid, title=mid, description="", section=section, kind="number")(_value)
    assert [(s.id, [m.id for m in ms]) for s, ms in r.sections()] == [
        ("a", ["one", "three"]),
        ("b", ["two"]),
    ]


def test_duplicate_id_fails():
    r = reg.Registry()
    r.metric(id="x", title="X", description="", section=A, kind="number")(_value)
    with pytest.raises(ValueError, match="registered twice"):
        r.metric(id="x", title="X again", description="", section=B, kind="number")(_value)


def test_section_id_with_two_titles_fails():
    r = reg.Registry()
    r.metric(id="x", title="X", description="", section=A, kind="number")(_value)
    with pytest.raises(ValueError, match="two different titles"):
        r.metric(id="y", title="Y", description="", section=reg.Section("a", "Other"), kind="number")(_value)


def test_unknown_kind_fails():
    with pytest.raises(ValueError, match="unknown kind"):
        reg.Registry().metric(id="x", title="X", description="", section=A, kind="pie")  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "kind, data",
    [
        ("number", {"value": 3}),
        ("number", {"value": 2.5, "hint": "Across 2 wheels"}),
        ("number", {"value": 200, "hint": None, "format": "duration"}),
        ("breakdown", {"items": [{"label": "Fair", "value": 2}]}),
        ("breakdown", {"items": []}),
        ("table", {"columns": ["Label", "Spins"], "rows": [["One", 3]]}),
    ],
)
def test_valid_shapes(kind, data):
    reg.validate_data(_metric(kind), data, _ctx())


def test_valid_series_shape():
    ctx = _ctx(7)
    model = reg.validate_data(_metric("series"), ctx.fill_days({"2026-11-03": 4}), ctx)
    assert isinstance(model, SeriesData)


@pytest.mark.parametrize(
    "kind, data",
    [
        ("number", {}),
        ("number", {"value": "3"}),
        ("number", {"value": 3, "extra": 1}),
        ("number", {"value": 3, "format": "minutes"}),
        ("series", {"points": [{"day": "2026-11-07"}]}),
        ("breakdown", {"items": [{"value": 2}]}),
        ("table", {"columns": ["A"], "rows": [[{"nested": 1}]]}),
        ("table", {"rows": []}),
    ],
)
def test_invalid_shapes_fail(kind, data):
    with pytest.raises(ValidationError):
        reg.validate_data(_metric(kind), data, _ctx())


def test_series_must_cover_every_day_in_order():
    ctx = _ctx(7)
    points = ctx.fill_days({})["points"]
    with pytest.raises(ValueError, match="one point per day"):
        reg.validate_data(_metric("series"), {"points": points[1:]}, ctx)
    with pytest.raises(ValueError, match="one point per day"):
        reg.validate_data(_metric("series"), {"points": list(reversed(points))}, ctx)


def test_range_is_whole_utc_days_ending_today():
    ctx = _ctx(7)
    assert ctx.day_list() == [f"2026-11-0{d}" for d in range(1, 8)]
    assert ctx.since == "2026-11-01T00:00:00.000Z"
    assert len(_ctx(90).day_list()) == 90


def test_fill_days_includes_zeros():
    assert _ctx(3).fill_days({"2026-11-06": 2, "2026-10-01": 9}) == {
        "points": [
            {"day": "2026-11-05", "value": 0},
            {"day": "2026-11-06", "value": 2},
            {"day": "2026-11-07", "value": 0},
        ]
    }


def test_default_registry_has_the_starting_metrics_in_order():
    import app.analytics.metrics  # noqa: F401

    layout = [(s.id, [m.id for m in ms]) for s, ms in reg.default_registry.sections()]
    assert layout == [
        ("now", ["live_games", "players_now"]),
        ("history", ["wheels_created_per_day", "spins_per_day", "names_added_per_day"]),
        ("visits", ["active_time_per_visit", "spins_per_visit", "visits_per_day", "active_minutes_per_day"]),
        ("wheels", ["wheels_stored", "wheels_used", "avg_names"]),
        ("links", ["links_created", "links_opened", "link_spins", "rule_decided"]),
        ("per_link", ["per_link_spins"]),
    ]


async def test_failing_metric_reports_class_name_and_others_still_load(caplog):
    r = reg.Registry()

    @r.metric(id="ok", title="OK", description="", section=A, kind="number")
    async def ok(ctx):
        return {"value": 5}

    @r.metric(id="boom", title="Boom", description="", section=A, kind="number")
    async def boom(ctx):
        raise RuntimeError("secret detail Anna")

    @r.metric(id="bad_shape", title="Bad", description="", section=B, kind="number")
    async def bad_shape(ctx):
        return {"value": "five"}

    report = await build_report(None, 7, now=NOW, registry=r)  # type: ignore[arg-type]
    by_id = {m.id: m for s in report.sections for m in s.metrics}
    assert isinstance(by_id["ok"].data, NumberData) and by_id["ok"].data.value == 5
    assert by_id["boom"].error == "RuntimeError" and by_id["boom"].data is None
    assert by_id["bad_shape"].error == "ValidationError"
    assert "secret" not in report.model_dump_json()
    assert "RuntimeError" in caplog.text and "secret" not in caplog.text
    assert report.generated_at == "2026-11-07T15:30:00.000Z"
