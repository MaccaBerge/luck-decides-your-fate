"""R4: client IP priority order."""
from starlette.requests import Request

from app.client_ip import get_client_ip


def make_request(headers=None, client=("10.0.0.9", 1234)):
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "headers": raw, "client": client})


def test_cloudflare_header_wins():
    r = make_request({"CF-Connecting-IP": "1.1.1.1", "X-Forwarded-For": "2.2.2.2, 3.3.3.3"})
    assert get_client_ip(r) == "1.1.1.1"


def test_first_forwarded_entry_is_next():
    assert get_client_ip(make_request({"X-Forwarded-For": " 2.2.2.2 , 3.3.3.3"})) == "2.2.2.2"


def test_peer_address_is_last():
    assert get_client_ip(make_request()) == "10.0.0.9"


def test_blank_headers_are_ignored():
    r = make_request({"CF-Connecting-IP": " ", "X-Forwarded-For": " "})
    assert get_client_ip(r) == "10.0.0.9"


def test_no_client_at_all():
    assert get_client_ip(make_request(client=None)) == "unknown"
