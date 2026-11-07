"""Socket tickets for multiplayer players (kept apart from players.py so AppContext can hold the store)."""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

TICKET_TTL_S = 30


@dataclass(frozen=True)
class _Ticket:
    game_id: str
    player_id: str
    expires: float


class TicketStore:
    """Single-use, short-lived tickets, so the player's key never appears in a socket URL."""

    def __init__(self) -> None:
        self._tickets: dict[str, _Ticket] = {}

    def issue(self, game_id: str, player_id: str) -> str:
        now = time.monotonic()
        self._tickets = {k: t for k, t in self._tickets.items() if t.expires > now}
        ticket = secrets.token_urlsafe(24)
        self._tickets[ticket] = _Ticket(game_id, player_id, now + TICKET_TTL_S)
        return ticket

    def consume(self, game_id: str, ticket: str | None) -> str | None:
        """The player ID for a valid ticket of this game, or None. A ticket works once."""
        if not ticket:
            return None
        t = self._tickets.pop(ticket, None)
        if t is None or t.game_id != game_id or t.expires <= time.monotonic():
            return None
        return t.player_id
