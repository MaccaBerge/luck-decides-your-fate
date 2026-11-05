"""In-memory sliding-window limiter for failed admin logins, per client IP."""
from __future__ import annotations

import math
import time
from collections import deque
from typing import Callable


class LoginRateLimiter:
    def __init__(
        self, attempts: int, window_seconds: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.attempts = attempts
        self.window_seconds = window_seconds
        self.clock = clock
        self._failures: dict[str, deque[float]] = {}
        self._last_sweep = clock()

    def retry_after(self, ip: str) -> int | None:
        """Whole seconds until `ip` may try again, or None if it isn't limited right now."""
        failures = self._failures.get(ip)
        if failures is None:
            return None
        now = self.clock()
        self._drop_expired(ip, failures, now)
        if len(failures) < self.attempts:
            return None
        return max(1, math.ceil(failures[0] + self.window_seconds - now))

    def record_failure(self, ip: str) -> None:
        now = self.clock()
        self._sweep(now)
        self._failures.setdefault(ip, deque()).append(now)

    def tracked_ips(self) -> int:
        return len(self._failures)

    def _drop_expired(self, ip: str, failures: deque[float], now: float) -> None:
        while failures and failures[0] + self.window_seconds <= now:
            failures.popleft()
        if not failures:
            self._failures.pop(ip, None)

    def _sweep(self, now: float) -> None:
        """Forget IPs whose failures have all expired, at most once per window."""
        if now - self._last_sweep < self.window_seconds:
            return
        self._last_sweep = now
        for ip, failures in list(self._failures.items()):
            self._drop_expired(ip, failures, now)
