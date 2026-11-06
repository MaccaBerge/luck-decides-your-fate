import secrets
import string

_ALPHABET = string.ascii_lowercase + string.digits

# Mirrored in frontend/src/lib/palette.ts.
PALETTE: list[str] = ["#C9B8FF", "#FFC9A8", "#B5EAD7", "#DCD0FF", "#FFDCC6"]


def next_color(position: int, previous: str | None, first: str | None) -> str:
    """The palette colour for a new last slice, which touches both the previous and the first slice."""
    start = position % len(PALETTE)
    for offset in range(len(PALETTE)):
        color = PALETTE[(start + offset) % len(PALETTE)]
        if color != previous and color != first:
            return color
    return PALETTE[start]


def _rand(n: int) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(n))


def new_game_id() -> str:
    """8 chars from [a-z0-9]. Used for BOTH public games and admin links."""
    return _rand(8)


def new_entry_id() -> str:
    return "en_" + _rand(10)
