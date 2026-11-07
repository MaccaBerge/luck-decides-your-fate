"""Run every registered metric and build the admin analytics report."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.analytics import metrics as _metrics  # noqa: F401  (importing registers the metrics)
from app.analytics import registry as reg
from app.context import AppContext
from app.models import AnalyticsMetric, AnalyticsReport, AnalyticsSection
from app.timeutil import utc_iso

log = logging.getLogger(__name__)


async def build_report(
    app: AppContext, days: int, *, now: datetime | None = None, registry: reg.Registry | None = None
) -> AnalyticsReport:
    now = now or datetime.now(timezone.utc)
    registry = registry or reg.default_registry
    mctx = reg.MetricContext(app=app, days=days, now=now)
    sections = []
    for section, metrics in registry.sections():
        out = []
        for m in metrics:
            item = AnalyticsMetric(id=m.id, title=m.title, description=m.description, kind=m.kind)
            try:
                item.data = reg.validate_data(m, await m.fn(mctx), mctx)  # type: ignore[assignment]
            except Exception as exc:  # noqa: BLE001  one broken metric must not break the page
                item.error = type(exc).__name__
                log.warning("analytics metric %s failed: %s", m.id, item.error)
            out.append(item)
        sections.append(AnalyticsSection(id=section.id, title=section.title, metrics=out))
    return AnalyticsReport(generated_at=utc_iso(now), days=days, sections=sections)  # type: ignore[arg-type]
