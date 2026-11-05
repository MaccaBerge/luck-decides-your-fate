"""Application configuration, read from environment variables (and an optional .env file).

Real environment variables always win over values in `.env` (``override=False``).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

MISSING_PASSWORD_MESSAGE = (
    "ERROR: the ADMIN_PASSWORD environment variable is required but not set.\n"
    "Set it in the environment or in backend/.env, for example:\n"
    "    ADMIN_PASSWORD=change-me uvicorn app.main:app --workers 1"
)


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


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"ERROR: {name} must be an integer, got {raw!r}") from exc


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
    return Settings(
        admin_password=password,
        database_path=os.environ.get("DATABASE_PATH") or "./data/luckdecidesyourfate.db",
        game_ttl_days=_env_int("GAME_TTL_DAYS", 7),
        cookie_secure=_env_bool("COOKIE_SECURE", False),
        spin_duration_ms_min=spin_min,
        spin_duration_ms_max=spin_max,
        frontend_dist=os.environ.get("FRONTEND_DIST") or "../frontend/dist",
    )
