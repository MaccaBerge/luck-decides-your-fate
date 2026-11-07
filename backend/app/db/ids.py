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


def new_player_id() -> str:
    return "pl_" + _rand(10)


# No look-alikes (0/O, 1/I/L), so a code read off a screen is easy to type.
JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
JOIN_CODE_LENGTH = 6


def new_join_code() -> str:
    return "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(JOIN_CODE_LENGTH))


def new_player_token() -> str:
    """The random key a player's browser keeps. Only its SHA-256 is stored."""
    return secrets.token_urlsafe(32)
