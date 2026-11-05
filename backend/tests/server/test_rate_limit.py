"""R5: admin login rate limiting."""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.rate_limit import LoginRateLimiter

from .helpers import PASSWORD, make_settings

LOGIN = "/api/admin/login"


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def fail(client, times=1, headers=None):
    for _ in range(times):
        r = client.post(LOGIN, json={"password": "wrong"}, headers=headers)
        assert r.status_code == 401, r.text


@pytest.fixture
def clock(app):
    fake = FakeClock()
    limiter = app.state.ctx.login_limiter
    limiter.clock = fake
    limiter._last_sweep = fake.now
    return fake


def test_sixth_attempt_is_429_with_retry_after(client, clock):
    fail(client, 5)
    r = client.post(LOGIN, json={"password": "wrong"})
    assert r.status_code == 429
    assert r.json() == {
        "error": {"code": "too_many_attempts", "message": "Too many login attempts. Try again later."}
    }
    assert r.headers["Retry-After"] == "60"


def test_retry_after_counts_down_to_the_oldest_failure(client, clock):
    fail(client, 1)
    clock.now += 20
    fail(client, 4)
    clock.now += 5.5
    r = client.post(LOGIN, json={"password": "wrong"})
    assert r.status_code == 429
    assert r.headers["Retry-After"] == "35"  # 60 - 25.5, rounded up to whole seconds


def test_correct_password_is_also_429_while_limited(client, clock):
    fail(client, 5)
    r = client.post(LOGIN, json={"password": PASSWORD})
    assert r.status_code == 429
    assert "admin_session" not in r.cookies


def test_attempts_while_limited_do_not_extend_the_block(client, clock):
    fail(client, 5)
    clock.now += 59
    assert client.post(LOGIN, json={"password": "wrong"}).status_code == 429
    clock.now += 1
    assert client.post(LOGIN, json={"password": PASSWORD}).status_code == 200


def test_limits_are_per_ip(client, clock):
    a = {"X-Forwarded-For": "1.1.1.1"}
    b = {"X-Forwarded-For": "2.2.2.2"}
    fail(client, 5, headers=a)
    assert client.post(LOGIN, json={"password": "wrong"}, headers=a).status_code == 429
    assert client.post(LOGIN, json={"password": PASSWORD}, headers=b).status_code == 200


def test_window_expires(client, clock):
    fail(client, 5)
    assert client.post(LOGIN, json={"password": PASSWORD}).status_code == 429
    clock.now += 60
    assert client.post(LOGIN, json={"password": PASSWORD}).status_code == 200


def test_sliding_window_frees_one_attempt_at_a_time(client, clock):
    fail(client, 1)
    clock.now += 30
    fail(client, 4)
    clock.now += 30  # the first failure left the window; four remain
    fail(client, 1)
    assert client.post(LOGIN, json={"password": PASSWORD}).status_code == 429


def test_successful_logins_do_not_count_as_failures(client, clock):
    for _ in range(10):
        assert client.post(LOGIN, json={"password": PASSWORD}).status_code == 200
    fail(client, 4)
    assert client.post(LOGIN, json={"password": PASSWORD}).status_code == 200


def test_limits_come_from_settings(tmp_path):
    settings = make_settings(tmp_path, login_rate_limit_attempts=2, login_rate_limit_window_seconds=7)
    with TestClient(create_app(settings, run_cleanup=False)) as c:
        fail(c, 2)
        r = c.post(LOGIN, json={"password": "wrong"})
        assert r.status_code == 429
        assert r.headers["Retry-After"] == "7"


def test_old_entries_are_pruned():
    clock = FakeClock()
    limiter = LoginRateLimiter(5, 60, clock=clock)
    for i in range(100):
        limiter.record_failure(f"10.0.0.{i}")
    assert limiter.tracked_ips() == 100
    clock.now += 61
    limiter.record_failure("10.0.1.1")
    assert limiter.tracked_ips() == 1
