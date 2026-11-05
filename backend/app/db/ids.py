import secrets
import string

_ALPHABET = string.ascii_lowercase + string.digits

PALETTE: list[str] = [
    "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#22C55E", "#14B8A6",
    "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#D946EF", "#EC4899",
]


def _rand(n: int) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(n))


def new_game_id() -> str:
    """8 chars from [a-z0-9]. Used for BOTH public games and admin links."""
    return _rand(8)


def new_entry_id() -> str:
    return "en_" + _rand(10)
