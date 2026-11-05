from datetime import datetime, timedelta, timezone


def _fmt(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def utc_now_iso() -> str:
    """ISO-8601 UTC with milliseconds and Z, e.g. 2026-11-03T18:22:05.123Z."""
    return _fmt(datetime.now(timezone.utc))


def utc_iso_days_ago(days: float) -> str:
    return _fmt(datetime.now(timezone.utc) - timedelta(days=days))
