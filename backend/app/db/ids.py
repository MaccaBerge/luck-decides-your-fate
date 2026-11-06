import secrets
import string

_ALPHABET = string.ascii_lowercase + string.digits

PALETTE: list[str] = [
    # Ordered so neighbouring slices contrast, whatever the number of names.
    "#D23C28", "#1A9E96", "#F2BE2E", "#3D4DB0", "#EC7A92", "#27804F",
    "#EE8A1D", "#3F97E4", "#B83F96", "#8FB83A", "#7650B8", "#8A5638",
]


def _rand(n: int) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(n))


def new_game_id() -> str:
    """8 chars from [a-z0-9]. Used for BOTH public games and admin links."""
    return _rand(8)


def new_entry_id() -> str:
    return "en_" + _rand(10)
