import pytest

from app.engine.names import normalize_name


@pytest.mark.parametrize("raw, expected", [
    ("JONAS", "jonas"),
    ("  Jo nas ", "jonas"),
    ("Jonas!", "jonas"),
    ("Jonas B.", "jonasb"),
    ("Bjørn", "bjørn"),
    ("José", "josé"),
    ("!!!", ""),
])
def test_normalize_table(raw, expected):
    assert normalize_name(raw) == expected


def test_jonas_b_does_not_match_jonas():
    assert normalize_name("Jonas B.") != normalize_name("Jonas")


def test_no_accent_folding():
    assert normalize_name("Bjorn") != normalize_name("Bjørn")
