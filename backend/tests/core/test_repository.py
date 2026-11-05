import re

import aiosqlite
import pytest

from app.db import repository as repo
from app.db.connection import get_db_path, init_db
from app.db.ids import PALETTE, new_entry_id, new_game_id

ISO = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")


def test_id_formats():
    for _ in range(200):
        assert re.fullmatch(r"[a-z0-9]{8}", new_game_id())
        assert re.fullmatch(r"en_[a-z0-9]{10}", new_entry_id())


async def test_create_and_get_game(db):
    g = await repo.create_game("public")
    assert re.fullmatch(r"[a-z0-9]{8}", g.id)
    assert g.origin == "public" and g.game_type == "wheel" and g.mode == "fair"
    assert g.target_names == [] and g.label is None and g.remove_winner is False
    assert g.first_opened_at is None
    assert ISO.match(g.created_at) and g.created_at == g.last_activity_at
    assert await repo.get_game(g.id) == g
    assert await repo.get_game("zzzzzzzz") is None

    link = await repo.create_game("admin_link", label="Party", mode="always",
                                  target_names=["Jonas", "J"])
    assert re.fullmatch(r"[a-z0-9]{8}", link.id)
    got = await repo.get_game(link.id)
    assert got.label == "Party" and got.mode == "always" and got.target_names == ["Jonas", "J"]


async def test_add_entries_positions_and_colors(db):
    g = await repo.create_game("public")
    names = [f"N{i}" for i in range(14)]
    entries = await repo.add_entries(g.id, names[:5])
    assert [e.position for e in entries] == list(range(5))
    entries = await repo.add_entries(g.id, names[5:])
    assert [e.position for e in entries] == list(range(14))
    assert [e.name for e in entries] == names
    for e in entries:
        assert re.fullmatch(r"en_[a-z0-9]{10}", e.id)
        assert e.color == PALETTE[e.position % 12]
        assert e.is_active and e.game_id == g.id and ISO.match(e.created_at)
    assert await repo.list_entries(g.id) == entries


async def test_add_entries_after_delete_appends_after_max(db):
    g = await repo.create_game("public")
    es = await repo.add_entries(g.id, ["A", "B", "C"])
    await repo.delete_entry(g.id, es[0].id)
    es = await repo.add_entries(g.id, ["D"])
    assert [(e.name, e.position) for e in es] == [("B", 1), ("C", 2), ("D", 3)]


async def test_shuffle_keeps_ids(db):
    g = await repo.create_game("public")
    before = await repo.add_entries(g.id, [str(i) for i in range(20)])
    orders = set()
    for _ in range(5):
        after = await repo.shuffle_entries(g.id)
        assert {e.id for e in after} == {e.id for e in before}
        assert sorted(e.position for e in after) == list(range(20))
        assert [e.position for e in after] == sorted(e.position for e in after)
        orders.add(tuple(e.id for e in after))
    assert len(orders) > 1
    # colors stay attached to entries
    colors = {e.id: e.color for e in before}
    assert all(colors[e.id] == e.color for e in after)


async def test_update_entry_and_restore(db):
    g = await repo.create_game("public")
    other = await repo.create_game("public")
    es = await repo.add_entries(g.id, ["A", "B", "C"])
    foreign = (await repo.add_entries(other.id, ["X"]))[0]

    e = await repo.update_entry(g.id, es[0].id, name="Alpha", color="#000000")
    assert e.name == "Alpha" and e.color == "#000000" and e.is_active
    e = await repo.update_entry(g.id, es[1].id, is_active=False)
    assert e.is_active is False and e.name == "B"
    e = await repo.update_entry(g.id, es[2].id)  # nothing changes
    assert e == es[2]

    assert await repo.update_entry(g.id, foreign.id, name="Hack") is None
    assert await repo.update_entry(g.id, "en_missing00", name="x") is None
    assert (await repo.list_entries(other.id))[0].name == "X"

    await repo.update_entry(g.id, es[2].id, is_active=False)
    restored = await repo.restore_entries(g.id)
    assert all(e.is_active for e in restored) and len(restored) == 3


async def test_delete_entry(db):
    g = await repo.create_game("public")
    other = await repo.create_game("public")
    es = await repo.add_entries(g.id, ["A", "B"])
    foreign = (await repo.add_entries(other.id, ["X"]))[0]
    assert await repo.delete_entry(g.id, es[0].id) is True
    assert await repo.delete_entry(g.id, es[0].id) is False
    assert await repo.delete_entry(g.id, foreign.id) is False
    assert [e.name for e in await repo.list_entries(g.id)] == ["B"]
    assert len(await repo.list_entries(other.id)) == 1


async def test_delete_game_cascades(db):
    g = await repo.create_game("admin_link", label="L")
    keep = await repo.create_game("public")
    es = await repo.add_entries(g.id, ["A", "B"])
    await repo.add_entries(keep.id, ["K"])
    await repo.record_spin(g.id, winner_entry_id=es[0].id, winner_name="A",
                           mode="fair", rule_applied=False)
    assert await repo.delete_game(g.id) is True
    assert await repo.delete_game(g.id) is False
    assert await repo.get_game(g.id) is None
    async with aiosqlite.connect(get_db_path()) as raw:
        for table in ("entries", "spins"):
            async with raw.execute(f"SELECT COUNT(*) FROM {table} WHERE game_id = ?",
                                   (g.id,)) as cur:
                assert (await cur.fetchone())[0] == 0
    assert len(await repo.list_entries(keep.id)) == 1


async def test_foreign_keys_enforced(db):
    with pytest.raises(aiosqlite.IntegrityError):
        await repo.add_entries("nosuchgm", ["A"])


async def test_mark_opened_only_once(db):
    g = await repo.create_game("admin_link")
    await repo.mark_opened(g.id)
    g1 = await repo.get_game(g.id)
    assert g1.first_opened_at is not None
    await repo.mark_opened(g.id)
    g2 = await repo.get_game(g.id)
    assert g2.first_opened_at == g1.first_opened_at
    assert g2.last_activity_at >= g1.last_activity_at


async def test_touch_game(db):
    g = await repo.create_game("public")
    await _set_activity(g.id, "2000-01-01T00:00:00.000Z")
    await repo.touch_game(g.id)
    g2 = await repo.get_game(g.id)
    assert g2.last_activity_at > "2000-01-01T00:00:00.000Z" and g2.first_opened_at is None


async def test_list_admin_links(db):
    a = await repo.create_game("admin_link", label="first")
    await repo.create_game("public")
    b = await repo.create_game("admin_link", label="second")
    links = await repo.list_admin_links()
    assert [l.id for l in links] == [b.id, a.id]
    assert all(l.origin == "admin_link" for l in links)


async def test_update_rules(db):
    g = await repo.create_game("admin_link", label="L", mode="always", target_names=["A"])
    g2 = await repo.update_rules(g.id, mode="never")
    assert g2.mode == "never" and g2.label == "L" and g2.target_names == ["A"]
    g3 = await repo.update_rules(g.id, target_names=["X", "Y"])
    assert g3.target_names == ["X", "Y"] and g3.mode == "never"
    g4 = await repo.update_rules(g.id, label=None)
    assert g4.label is None and g4.target_names == ["X", "Y"]
    g5 = await repo.update_rules(g.id)
    assert g5 == g4
    assert await repo.update_rules("zzzzzzzz", mode="fair") is None


async def test_update_settings(db):
    g = await repo.create_game("public")
    assert (await repo.update_settings(g.id, remove_winner=True)).remove_winner is True
    assert (await repo.get_game(g.id)).remove_winner is True
    assert (await repo.update_settings(g.id, remove_winner=False)).remove_winner is False
    assert await repo.update_settings("zzzzzzzz", remove_winner=True) is None


async def test_spins_lifecycle(db):
    g = await repo.create_game("admin_link")
    es = await repo.add_entries(g.id, ["A", "B"])
    assert await repo.get_last_finished_spin(g.id) is None

    s1 = await repo.record_spin(g.id, winner_entry_id=es[0].id, winner_name="A",
                                mode="always", rule_applied=True)
    assert s1.finished_at is None and s1.rule_applied is True and s1.mode == "always"
    assert ISO.match(s1.started_at)
    assert await repo.get_last_finished_spin(g.id) is None

    f1 = await repo.finish_spin(s1.id)
    assert f1.id == s1.id and f1.finished_at is not None and ISO.match(f1.finished_at)

    s2 = await repo.record_spin(g.id, winner_entry_id=es[1].id, winner_name="B",
                                mode="fair", rule_applied=False)
    assert s2.id > s1.id
    last = await repo.get_last_finished_spin(g.id)
    assert last.id == s1.id  # s2 not finished yet

    spins = await repo.list_spins(g.id)
    assert [s.id for s in spins] == [s2.id, s1.id]
    assert spins[0].rule_applied is False

    await repo.finish_spin(s2.id)
    assert (await repo.get_last_finished_spin(g.id)).id == s2.id

    for _ in range(5):
        await repo.record_spin(g.id, winner_entry_id=es[0].id, winner_name="A",
                               mode="fair", rule_applied=False)
    limited = await repo.list_spins(g.id, limit=3)
    assert len(limited) == 3 and limited[0].id > limited[1].id > limited[2].id

    # winner_name snapshot survives entry deletion
    await repo.delete_entry(g.id, es[0].id)
    assert (await repo.list_spins(g.id))[-1].winner_name == "A"


async def test_finish_dangling_spins(db):
    g = await repo.create_game("public")
    es = await repo.add_entries(g.id, ["A", "B"])
    s1 = await repo.record_spin(g.id, winner_entry_id=es[0].id, winner_name="A",
                                mode="fair", rule_applied=False)
    s2 = await repo.record_spin(g.id, winner_entry_id=es[1].id, winner_name="B",
                                mode="fair", rule_applied=False)
    s3 = await repo.record_spin(g.id, winner_entry_id=es[1].id, winner_name="B",
                                mode="fair", rule_applied=False)
    done = await repo.finish_spin(s1.id)
    assert await repo.finish_dangling_spins() == 2
    spins = {s.id: s for s in await repo.list_spins(g.id)}
    assert all(s.finished_at for s in spins.values())
    assert spins[s1.id].finished_at == done.finished_at
    assert await repo.finish_dangling_spins() == 0
    assert s2.id in spins and s3.id in spins


async def _set_activity(game_id: str, iso: str) -> None:
    async with aiosqlite.connect(get_db_path()) as raw:
        await raw.execute("UPDATE games SET last_activity_at = ? WHERE id = ?", (iso, game_id))
        await raw.commit()


async def test_delete_inactive_public_games(db):
    old_public = await repo.create_game("public")
    new_public = await repo.create_game("public")
    old_link = await repo.create_game("admin_link", label="never delete")
    await repo.add_entries(old_public.id, ["A"])
    await _set_activity(old_public.id, "2020-01-01T00:00:00.000Z")
    await _set_activity(old_link.id, "2020-01-01T00:00:00.000Z")

    deleted = await repo.delete_inactive_public_games(7)
    assert deleted == [old_public.id]
    assert await repo.get_game(old_public.id) is None
    assert await repo.list_entries(old_public.id) == []
    assert await repo.get_game(new_public.id) is not None
    assert await repo.get_game(old_link.id) is not None
    assert await repo.get_game(old_link.id) is not None


async def test_delete_inactive_respects_threshold(db):
    from app.timeutil import utc_iso_days_ago
    six = await repo.create_game("public")
    eight = await repo.create_game("public")
    await _set_activity(six.id, utc_iso_days_ago(6))
    await _set_activity(eight.id, utc_iso_days_ago(8))
    assert await repo.delete_inactive_public_games(7) == [eight.id]
    assert await repo.get_game(six.id) is not None


async def test_reinit_with_other_path(tmp_path):
    await init_db(str(tmp_path / "a" / "one.db"))
    g = await repo.create_game("public")
    await init_db(str(tmp_path / "b" / "two.db"))
    assert await repo.get_game(g.id) is None
    assert get_db_path().endswith("two.db")
    # init_db is idempotent on an existing DB
    await init_db(str(tmp_path / "a" / "one.db"))
    assert await repo.get_game(g.id) is not None
