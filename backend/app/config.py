"""Application configuration, read from environment variables (and an optional .env file).

Real environment variables always win over values in `.env` (``override=False``).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

MISSING_PASSWORD_MESSAGE = (
    "ERROR: the ADMIN_PASSWORD environment variable is required but not set.\n"
    "Set it in the environment or in backend/.env, for example:\n"
    "    ADMIN_PASSWORD=change-me uvicorn app.main:app --workers 1"
)


MIN_RECOMMENDED_PASSWORD_LENGTH = 16


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or invalid."""


@dataclass(frozen=True)
class Settings:
    admin_password: str
    database_path: str = "./data/luckdecidesyourfate.db"
    game_ttl_days: int = 7
    cookie_secure: bool = False
    spin_duration_ms_min: int = 4500
    spin_duration_ms_max: int = 7000
    frontend_dist: str = "../frontend/dist"
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 60
    backup_s3_endpoint: str | None = field(default=None, repr=False)
    backup_s3_bucket: str | None = field(default=None, repr=False)
    backup_s3_access_key_id: str | None = field(default=None, repr=False)
    backup_s3_secret_access_key: str | None = field(default=None, repr=False)
    backup_interval_hours: int = 24
    backup_keep: int = 14

    @property
    def backups_enabled(self) -> bool:
        return self.backup_s3_endpoint is not None


BACKUP_S3_VARS = (
    "BACKUP_S3_ENDPOINT",
    "BACKUP_S3_BUCKET",
    "BACKUP_S3_ACCESS_KEY_ID",
    "BACKUP_S3_SECRET_ACCESS_KEY",
)

_TRUE_VALUES = {"true", "1", "yes"}
_FALSE_VALUES = {"false", "0", "no"}


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    value = raw.strip().lower()
    if value in _TRUE_VALUES:
        return True
    if value in _FALSE_VALUES:
        return False
    raise ConfigError(f"ERROR: {name} must be one of true/false/1/0/yes/no, got {raw!r}")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"ERROR: {name} must be an integer, got {raw!r}") from exc


def _env_positive_int(name: str, default: int) -> int:
    value = _env_int(name, default)
    if value <= 0:
        raise ConfigError(f"ERROR: {name} must be greater than 0, got {value}")
    return value


def _backup_s3_values() -> dict[str, str | None]:
    """All four values, or none: a partial setup is a mistake, not a way to turn backups off."""
    values = {name: (os.environ.get(name) or "").strip() or None for name in BACKUP_S3_VARS}
    missing = [name for name, value in values.items() if value is None]
    if missing and len(missing) < len(BACKUP_S3_VARS):
        raise ConfigError(f"ERROR: backups need all of {', '.join(BACKUP_S3_VARS)}; missing {', '.join(missing)}")
    return values


def load_settings() -> Settings:
    """Load settings from the environment. Raises ConfigError if ADMIN_PASSWORD is missing."""
    load_dotenv(BACKEND_DIR / ".env", override=False)
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not password:
        raise ConfigError(MISSING_PASSWORD_MESSAGE)
    spin_min = _env_int("SPIN_DURATION_MS_MIN", 4500)
    spin_max = _env_int("SPIN_DURATION_MS_MAX", 7000)
    if spin_min <= 0 or spin_max < spin_min:
        raise ConfigError(
            "ERROR: SPIN_DURATION_MS_MIN must be > 0 and <= SPIN_DURATION_MS_MAX "
            f"(got {spin_min} / {spin_max})"
        )
    backup_s3 = _backup_s3_values()
    return Settings(
        admin_password=password,
        database_path=os.environ.get("DATABASE_PATH") or "./data/luckdecidesyourfate.db",
        game_ttl_days=_env_int("GAME_TTL_DAYS", 7),
        cookie_secure=_env_bool("COOKIE_SECURE", False),
        spin_duration_ms_min=spin_min,
        spin_duration_ms_max=spin_max,
        frontend_dist=os.environ.get("FRONTEND_DIST") or "../frontend/dist",
        login_rate_limit_attempts=_env_positive_int("LOGIN_RATE_LIMIT_ATTEMPTS", 5),
        login_rate_limit_window_seconds=_env_positive_int("LOGIN_RATE_LIMIT_WINDOW_SECONDS", 60),
        backup_s3_endpoint=backup_s3["BACKUP_S3_ENDPOINT"],
        backup_s3_bucket=backup_s3["BACKUP_S3_BUCKET"],
        backup_s3_access_key_id=backup_s3["BACKUP_S3_ACCESS_KEY_ID"],
        backup_s3_secret_access_key=backup_s3["BACKUP_S3_SECRET_ACCESS_KEY"],
        backup_interval_hours=_env_positive_int("BACKUP_INTERVAL_HOURS", 24),
        backup_keep=_env_positive_int("BACKUP_KEEP", 14),
    )


def config_summary(settings: Settings, *, frontend_served: bool) -> str:
    """One startup log line. Must never contain a secret."""
    return (
        f"config: db={settings.database_path} "
        f"cookie_secure={'true' if settings.cookie_secure else 'false'} "
        f"ttl_days={settings.game_ttl_days} "
        f"frontend={'yes' if frontend_served else 'no'} "
        f"backups={'on' if settings.backups_enabled else 'off'}"
    )
