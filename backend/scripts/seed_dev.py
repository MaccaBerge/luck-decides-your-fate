"""Fill a local dev server with test data, through the normal API. Used by `./dev.sh --seed`.

Usage: seed_dev.py BACKEND_URL FRONTEND_URL   (reads ADMIN_PASSWORD from the environment)

Creates an ordinary wheel with a few finished spins, a link rigged to "always Jonas" with a few
spins, and a fair link that nobody has opened. Prints one line per item with its URL.
Never point this at production: it refuses anything but localhost.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = ""
COOKIE = ""


def call(method: str, path: str, body: dict | None = None) -> dict:
    global COOKIE
    req = urllib.request.Request(
        API + path,
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"content-type": "application/json", **({"cookie": COOKIE} if COOKIE else {})},
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        set_cookie = res.headers.get("set-cookie")
        if set_cookie:
            COOKIE = set_cookie.split(";", 1)[0]
        raw = res.read()
        return json.loads(raw) if raw else {}


def spin_and_wait(game_id: str) -> str:
    winner = call("POST", f"/api/games/{game_id}/spin")["winner_name"]
    for _ in range(100):
        if call("GET", f"/api/games/{game_id}")["current_spin"] is None:
            return winner
        time.sleep(0.1)
    raise RuntimeError("a spin didn't finish")


def main() -> None:
    global API
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    API, site = sys.argv[1].rstrip("/"), sys.argv[2].rstrip("/")
    if urllib.parse.urlparse(API).hostname not in {"localhost", "127.0.0.1"}:
        sys.exit("seed_dev.py only runs against a local server.")

    wheel = call("POST", "/api/games")["id"]
    call("POST", f"/api/games/{wheel}/entries", {"names": ["Anna", "Jonas", "Mia", "Leo", "Sara", "Emil"]})
    winners = [spin_and_wait(wheel) for _ in range(3)]

    call("POST", "/api/admin/login", {"password": os.environ["ADMIN_PASSWORD"]})
    rigged = call("POST", "/api/admin/links", {"label": "Test: always Jonas", "mode": "always",
                                               "target_names": ["Jonas"]})["game"]["id"]
    call("POST", f"/api/games/{rigged}/entries", {"names": ["Anna", "Jonas", "Mia", "Leo"]})
    rigged_winners = [spin_and_wait(rigged) for _ in range(3)]
    fair = call("POST", "/api/admin/links", {"label": "Test: fair, not opened yet"})["game"]["id"]
    call("POST", f"/api/games/{fair}/entries", {"names": ["Nora", "Oskar", "Ida"]})

    print(f"   Wheel        {site}/g/{wheel}    (spins: {', '.join(winners)})")
    print(f"   Rigged link  {site}/g/{rigged}    (always Jonas; spins: {', '.join(rigged_winners)})")
    print(f"                control page: {site}/admin/links/{rigged}")
    print(f"   Fair link    {site}/g/{fair}    (not opened yet)")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        sys.exit(f"seeding failed: {e.code} {e.read().decode(errors='replace')}")
