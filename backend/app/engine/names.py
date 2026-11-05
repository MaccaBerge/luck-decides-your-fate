def normalize_name(name: str) -> str:
    """Keep only alphanumeric characters, then casefold. No accent folding."""
    return "".join(ch for ch in name if ch.isalnum()).casefold()
