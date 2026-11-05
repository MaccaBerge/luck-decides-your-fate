"""R3: configuration parsing and the startup log."""
import logging

import pytest
from fastapi.testclient import TestClient

from app.config import ConfigError, config_summary, load_settings
from app.main import create_app

from .helpers import make_settings

CONFIG_VARS = (
    "DATABASE_PATH", "COOKIE_SECURE", "GAME_TTL_DAYS", "SPIN_DURATION_MS_MIN",
    "SPIN_DURATION_MS_MAX", "FRONTEND_DIST", "LOGIN_RATE_LIMIT_ATTEMPTS",
    "LOGIN_RATE_LIMIT_WINDOW_SECONDS",
)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "a-long-enough-password")
    for name in CONFIG_VARS:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_defaults(env):
    s = load_settings()
    assert s.database_path == "./data/luckdecidesyourfate.db"
    assert s.cookie_secure is False
    assert s.game_ttl_days == 7
    assert s.login_rate_limit_attempts == 5
    assert s.login_rate_limit_window_seconds == 60


def test_missing_password_is_an_error(env):
    env.setenv("ADMIN_PASSWORD", "")
    with pytest.raises(ConfigError, match="ADMIN_PASSWORD"):
        load_settings()


@pytest.mark.parametrize(
    "raw,expected",
    [("true", True), ("TRUE", True), ("1", True), ("yes", True), ("Yes", True),
     ("false", False), ("False", False), ("0", False), ("no", False), ("NO", False)],
)
def test_cookie_secure_values(env, raw, expected):
    env.setenv("COOKIE_SECURE", raw)
    assert load_settings().cookie_secure is expected


@pytest.mark.parametrize("raw", ["maybe", "on", "off", "2"])
def test_invalid_cookie_secure_is_an_error(env, raw):
    env.setenv("COOKIE_SECURE", raw)
    with pytest.raises(ConfigError, match="COOKIE_SECURE"):
        load_settings()


@pytest.mark.parametrize("name", ["LOGIN_RATE_LIMIT_ATTEMPTS", "LOGIN_RATE_LIMIT_WINDOW_SECONDS"])
@pytest.mark.parametrize("raw", ["0", "-1", "abc"])
def test_invalid_rate_limit_settings_are_errors(env, name, raw):
    env.setenv(name, raw)
    with pytest.raises(ConfigError, match=name):
        load_settings()


def test_summary_format(tmp_path):
    settings = make_settings(tmp_path, database_path="/data/x.db", cookie_secure=True)
    assert config_summary(settings, frontend_served=True) == (
        "config: db=/data/x.db cookie_secure=true ttl_days=7 frontend=yes"
    )


def test_startup_logs_config_line_without_the_password(tmp_path, caplog):
    app = create_app(make_settings(tmp_path, admin_password="s3cret-but-short"), run_cleanup=False)
    with caplog.at_level(logging.INFO, logger="app"), TestClient(app):
        pass
    assert any(r.getMessage().startswith("config: db=") for r in caplog.records)
    assert "s3cret-but-short" not in caplog.text


def test_short_password_warns_without_logging_the_value(tmp_path, caplog):
    app = create_app(make_settings(tmp_path, admin_password="short"), run_cleanup=False)
    with caplog.at_level(logging.INFO, logger="app"), TestClient(app):
        pass
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("ADMIN_PASSWORD" in m for m in warnings)
    assert "short" not in " ".join(m.replace("shorter", "") for m in warnings)


def test_long_password_does_not_warn(tmp_path, caplog):
    app = create_app(make_settings(tmp_path, admin_password="x" * 16), run_cleanup=False)
    with caplog.at_level(logging.INFO, logger="app"), TestClient(app):
        pass
    assert not [r for r in caplog.records if r.levelno == logging.WARNING]
