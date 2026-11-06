"""Realtime smoke test. Run from backend/ with the server running (see §12.2)."""
import asyncio, json, os
import httpx, websockets

BASE = os.environ.get("BASE", "http://localhost:8000")
WS = BASE.replace("http", "ws", 1)
PW = os.environ.get("ADMIN_PASSWORD", "testpass")
FORBIDDEN = {"mode", "target_names", "label", "origin", "rule_status", "rule_applied", "matched_target", "matched_entry_ids"}

def ok(m): print(f"✓ {m}")

def assert_no_leak(obj):
    if isinstance(obj, dict):
        leaked = FORBIDDEN & obj.keys()
        assert not leaked, f"leaked keys {leaked}"
        for v in obj.values(): assert_no_leak(v)
    elif isinstance(obj, list):
        for v in obj: assert_no_leak(v)

async def next_event(ws, pred, timeout=5.0):
    async def loop():
        while True:
            m = json.loads(await ws.recv())
            if pred(m): return m
    return await asyncio.wait_for(loop(), timeout)

async def expect_close(url, code, headers=None):
    async with websockets.connect(url, additional_headers=headers) as ws:
        try:
            await asyncio.wait_for(ws.recv(), 3)
            raise AssertionError(f"{url} was not closed")
        except websockets.exceptions.ConnectionClosed as e:
            assert e.rcvd is not None and e.rcvd.code == code, f"expected close {code}, got {e.rcvd}"

async def main():
    async with httpx.AsyncClient(base_url=BASE) as http:
        r = await http.post("/api/admin/login", json={"password": PW}); assert r.status_code == 200, r.text
        cookie = {"Cookie": f"admin_session={http.cookies.get('admin_session')}"}
        r = await http.post("/api/admin/links", json={"label": "rt", "mode": "always", "target_names": ["Jonas"]})
        assert r.status_code == 201, r.text
        link = r.json()["game"]["id"]

        await expect_close(f"{WS}/ws/admin/games/{link}", 4401); ok("admin socket without cookie → 4401")
        await expect_close(f"{WS}/ws/games/zzzzzzzz", 4404);     ok("unknown game socket → 4404")

        async with websockets.connect(f"{WS}/ws/admin", additional_headers=cookie) as dash, \
                   websockets.connect(f"{WS}/ws/admin/games/{link}", additional_headers=cookie) as adm:
            live0 = (await next_event(dash, lambda m: m["type"] == "dashboard"))["dashboard"]["live_games"]
            a0 = await next_event(adm, lambda m: m["type"] == "admin_state")
            assert a0["state"]["link"]["status"] == "created"; ok("admin_state on connect, status created")

            async with websockets.connect(f"{WS}/ws/games/{link}") as player:
                p0 = await next_event(player, lambda m: m["type"] == "state"); assert_no_leak(p0)
                await next_event(adm, lambda m: m["type"] == "admin_state"
                                 and m["state"]["link"]["status"] == "connected"
                                 and m["state"]["link"]["player_count"] == 1)
                ok("admin sees friend connect live")
                await next_event(dash, lambda m: m["dashboard"]["live_games"] == live0 + 1)
                ok("live counter increments")

                await http.post(f"/api/games/{link}/entries", json={"names": ["Anna", "Jonas", "Per"]})
                await next_event(player, lambda m: m["type"] == "state" and len(m["state"]["entries"]) == 3)
                await next_event(adm, lambda m: m["type"] == "admin_state"
                                 and len(m["state"]["game"]["entries"]) == 3
                                 and m["state"]["rule_status"]["state"] == "active")
                ok("entries sync to player and admin")

                r = await http.post(f"/api/games/{link}/spin"); assert r.status_code == 202, r.text
                ps = await next_event(player, lambda m: m["type"] == "spin_started")
                assert_no_leak(ps); assert ps["spin"]["winner_name"] == "Jonas"
                asp = await next_event(adm, lambda m: m["type"] == "spin_started")
                assert asp["rule_applied"] is True
                await next_event(player, lambda m: m["type"] == "spin_finished", timeout=10)
                done = await next_event(player, lambda m: m["type"] == "state", timeout=5)
                assert_no_leak(done)
                recent = done["state"]["recent_spins"]
                assert recent and set(recent[0]) == {"spin_id", "winner_name", "finished_at"}, recent
                ok("spin broadcast; rule_applied only on admin socket")
                ok("recent_spins has exactly the three allowed keys")

                await http.patch(f"/api/admin/links/{link}", json={"mode": "never", "label": "changed"})
                await next_event(adm, lambda m: m["type"] == "admin_state" and m["state"]["link"]["mode"] == "never")
                try:
                    msg = await asyncio.wait_for(player.recv(), 1.5)
                    raise AssertionError(f"player got a message after a rule change: {msg}")
                except asyncio.TimeoutError:
                    ok("rule change invisible to players")

            await next_event(adm, lambda m: m["type"] == "admin_state" and m["state"]["link"]["status"] == "disconnected")
            ok("admin sees friend disconnect")

        async with websockets.connect(f"{WS}/ws/games/{link}") as player:
            await next_event(player, lambda m: m["type"] == "state")
            await http.delete(f"/api/admin/links/{link}")
            await next_event(player, lambda m: m["type"] == "game_deleted")
            ok("players notified on link delete")
    print("ALL REALTIME SMOKE CHECKS PASSED")

asyncio.run(main())
