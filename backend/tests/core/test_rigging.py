import random
import secrets
from collections import Counter

import pytest

from app.db.rows import EntryRow
from app.engine.rigging import PickResult, RuleStatus, evaluate_rule, pick_winner


def make(*names):
    return [EntryRow(id=f"en_{i:010d}", game_id="g", name=n, color="#EF4444",
                     position=i, is_active=True, created_at="2026-01-01T00:00:00.000Z")
            for i, n in enumerate(names)]


# ---------- evaluate_rule ----------
def test_first_matching_target_in_list_wins():
    entries = make("Anna", "Jonas")
    st = evaluate_rule(entries, "always", ["Erik", "Jonas"])
    assert isinstance(st, RuleStatus)
    assert st.state == "active"
    assert st.matched_target == "Jonas"
    assert st.matched_entry_ids == [entries[1].id]


def test_priority_order():
    entries = make("Anna", "Jonas")
    st = evaluate_rule(entries, "always", ["Jonas", "Anna"])
    assert st.state == "active" and st.matched_target == "Jonas"


def test_matched_target_is_as_typed_and_normalized_match():
    entries = make("Anna", "  JONAS ")
    st = evaluate_rule(entries, "always", ["Erik", "jonas"])
    assert st.state == "active" and st.matched_target == "jonas"
    assert st.matched_entry_ids == [entries[1].id]


def test_empty_normalized_target_skipped():
    entries = make("Anna", "Jonas", "!!!")
    st = evaluate_rule(entries, "always", ["!!!", "Anna"])
    assert st.state == "active" and st.matched_target == "Anna"
    # "!!!" alone never matches, even an entry that is also "!!!"
    st2 = evaluate_rule(entries, "always", ["!!!"])
    assert st2.state == "no_match" and st2.matched_target is None and st2.matched_entry_ids == []


def test_no_match():
    st = evaluate_rule(make("Anna", "Per"), "never", ["Erik", "Jonas"])
    assert st.state == "no_match"
    assert st.matched_target is None and st.matched_entry_ids == []


def test_empty_targets_no_match():
    assert evaluate_rule(make("Anna", "Per"), "always", []).state == "no_match"


def test_never_all_excluded():
    entries = make("Jonas", " jonas ")
    st = evaluate_rule(entries, "never", ["Jonas"])
    assert st.state == "all_excluded"
    assert set(st.matched_entry_ids) == {e.id for e in entries}


def test_always_all_x_is_active():
    st = evaluate_rule(make("Jonas", " jonas "), "always", ["Jonas"])
    assert st.state == "active"


def test_fair_mode_still_computes_match():
    entries = make("Anna", "Jonas")
    st = evaluate_rule(entries, "fair", ["Jonas"])
    assert st.state == "fair_mode"
    assert st.matched_target == "Jonas" and st.matched_entry_ids == [entries[1].id]
    assert evaluate_rule(entries, "fair", []).state == "fair_mode"


# ---------- pick_winner ----------
def test_fair_distribution():
    rng = random.Random(1234)
    entries = make("A", "B", "C", "D")
    counts = Counter(pick_winner(entries, "fair", ["A"], rng).winner.id for _ in range(12000))
    assert len(counts) == 4
    for c in counts.values():
        assert 2700 <= c <= 3300


def test_fair_rule_applied_false():
    r = pick_winner(make("A", "B"), "fair", ["A"], random.Random(1))
    assert isinstance(r, PickResult) and r.rule_applied is False


def test_always_picks_x():
    rng = secrets.SystemRandom()
    entries = make("Anna", "Jonas", "Per", "Kari")
    for _ in range(1000):
        r = pick_winner(entries, "always", ["Erik", "jonas"], rng)
        assert r.winner.name == "Jonas" and r.rule_applied is True


def test_always_duplicates_both_picked():
    rng = random.Random(42)
    entries = make("Jonas", "JONAS", "Per")
    counts = Counter(pick_winner(entries, "always", ["Jonas"], rng).winner.id
                     for _ in range(1000))
    assert counts[entries[0].id] > 0
    assert counts[entries[1].id] > 0
    assert counts[entries[2].id] == 0


def test_never_excludes_x():
    rng = random.Random(7)
    entries = make("Anna", "Jonas", "Per", "Kari")
    counts = Counter()
    for _ in range(1000):
        r = pick_winner(entries, "never", ["Jonas"], rng)
        assert r.rule_applied is True
        counts[r.winner.name] += 1
    assert counts["Jonas"] == 0
    assert set(counts) == {"Anna", "Per", "Kari"}


def test_never_with_duplicates_excludes_all_x():
    rng = random.Random(8)
    entries = make("Jonas", "jonas!", "Per", "Kari")
    for _ in range(500):
        assert pick_winner(entries, "never", ["JONAS"], rng).winner.name in {"Per", "Kari"}


def test_all_excluded_falls_back_to_fair():
    rng = random.Random(3)
    entries = make("Jonas", " jonas ")
    counts = Counter()
    for _ in range(1000):
        r = pick_winner(entries, "never", ["Jonas"], rng)
        assert r.rule_applied is False
        counts[r.winner.id] += 1
    assert len(counts) == 2 and min(counts.values()) > 350


def test_no_match_falls_back_to_fair():
    rng = random.Random(4)
    entries = make("Anna", "Per", "Kari")
    for mode in ("always", "never"):
        counts = Counter()
        for _ in range(1500):
            r = pick_winner(entries, mode, ["Erik"], rng)
            assert r.rule_applied is False
            counts[r.winner.id] += 1
        assert len(counts) == 3 and min(counts.values()) > 400


def test_empty_raises():
    with pytest.raises(ValueError):
        pick_winner([], "fair", [], random.Random(1))
    with pytest.raises(ValueError):
        pick_winner([], "always", ["Jonas"], random.Random(1))


def test_never_x_last_one_standing():
    """never X + remove winner -> X is the last one standing."""
    rng = random.Random(9)
    entries = make("Anna", "Jonas", "Per", "Kari", "Ola")
    while len(entries) > 1:
        r = pick_winner(entries, "never", ["Jonas"], rng)
        entries = [e for e in entries if e.id != r.winner.id]
    assert entries[0].name == "Jonas"


# ---------- targets (for the controller's click-to-target UI) ----------
def test_targets_lists_every_target_in_order_with_its_matches():
    entries = make("Anna", "Jonas", "jonas!", "Mia")
    st = evaluate_rule(entries, "always", ["Erik", "JONAS", "Anna", "!!!"])
    assert st.targets == (
        ("Erik", ()),
        ("JONAS", (entries[1].id, entries[2].id)),
        ("Anna", (entries[0].id,)),
        ("!!!", ()),
    )
    assert st.matched_target == "JONAS"  # the first target that matches still decides


@pytest.mark.parametrize("mode", ["fair", "always", "never"])
def test_targets_present_in_every_state(mode):
    entries = make("Anna")
    st = evaluate_rule(entries, mode, ["Anna", "Erik"])
    assert st.targets == (("Anna", (entries[0].id,)), ("Erik", ()))
    assert evaluate_rule(entries, mode, []).targets == ()
