"""The statistics registry. A statistic is one async function decorated with ``@metric``.

Registration order is display order (sections appear in the order their first metric
registers). See docs/analytics.md for how to add or remove one.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from pydantic import BaseModel

from app.models import BreakdownData, MetricKind, NumberData, SeriesData, TableData
from app.timeutil import utc_iso

if TYPE_CHECKING:
    from app.context import AppContext

DATA_MODELS: dict[str, type[BaseModel]] = {
    "number": NumberData,
    "series": SeriesData,
    "breakdown": BreakdownData,
    "table": TableData,
}


@dataclass(frozen=True)
class MetricContext:
    """Everything a metric function gets: the app, the selected range and the current time."""

    app: AppContext
    days: int
    now: datetime  # timezone-aware UTC

    @property
    def first_day(self) -> date:
        """The oldest UTC day in the range. The range is `days` whole UTC days, ending today."""
        return self.now.astimezone(timezone.utc).date() - timedelta(days=self.days - 1)

    @property
    def since(self) -> str:
        """Midnight UTC at the start of the range, in the database's timestamp format."""
        return utc_iso(datetime.combine(self.first_day, time.min, tzinfo=timezone.utc))

    def day_list(self) -> list[str]:
        """Every day in the range as YYYY-MM-DD, oldest first."""
        return [(self.first_day + timedelta(days=i)).isoformat() for i in range(self.days)]

    def fill_days(self, counts: dict[str, int]) -> dict[str, Any]:
        """A `series` result: one point per day in the range, zeros for days missing from `counts`."""
        return {"points": [{"day": d, "value": int(counts.get(d, 0))} for d in self.day_list()]}


MetricFn = Callable[[MetricContext], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class Section:
    id: str
    title: str


@dataclass(frozen=True)
class Metric:
    id: str
    title: str
    description: str
    section: Section
    kind: MetricKind
    fn: MetricFn


@dataclass
class Registry:
    metrics: list[Metric] = field(default_factory=list)

    def metric(
        self, *, id: str, title: str, description: str, section: Section, kind: MetricKind
    ) -> Callable[[MetricFn], MetricFn]:
        if kind not in DATA_MODELS:
            raise ValueError(f"metric {id!r}: unknown kind {kind!r}")

        def register(fn: MetricFn) -> MetricFn:
            if any(m.id == id for m in self.metrics):
                raise ValueError(f"metric id {id!r} is registered twice")
            for m in self.metrics:
                if m.section.id == section.id and m.section != section:
                    raise ValueError(f"section id {section.id!r} has two different titles")
            self.metrics.append(Metric(id, title, description, section, kind, fn))
            return fn

        return register

    def sections(self) -> list[tuple[Section, list[Metric]]]:
        grouped: dict[str, tuple[Section, list[Metric]]] = {}
        for m in self.metrics:
            grouped.setdefault(m.section.id, (m.section, []))[1].append(m)
        return list(grouped.values())


def validate_data(metric: Metric, data: Any, ctx: MetricContext) -> BaseModel:
    """Check a metric's return value against its kind. Raises on a wrong shape."""
    model = DATA_MODELS[metric.kind].model_validate(data)
    if isinstance(model, SeriesData) and [p.day for p in model.points] != ctx.day_list():
        raise ValueError(f"metric {metric.id!r}: a series needs one point per day in the range")
    return model


default_registry = Registry()
metric = default_registry.metric
