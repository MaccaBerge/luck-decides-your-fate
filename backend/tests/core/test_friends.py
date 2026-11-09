from app.engine.friends import is_match, matched_friends, parse_friends

FRIENDS = [["Jonas", "Jonny"], ["Mia"], ["Marcus", "Macca"]]


def test_parse_friends():
    assert parse_friends("Jonas, Jonny\n\n  Mia \n, \nMarcus,Macca,") == FRIENDS


def test_matches_by_any_name_and_counts_each_friend_once():
    assert matched_friends(FRIENDS, ["jonny", "Anna", "MIA"]) == ["Jonas", "Mia"]
    assert matched_friends(FRIENDS, ["Jonas", "Jonny"]) == ["Jonas"]
    assert not is_match(FRIENDS, ["Jonas", "Jonny", "Anna"])  # one friend, two names
    assert is_match(FRIENDS, ["Macca", "Jonas"])


def test_no_friends_no_match():
    assert matched_friends([], ["Jonas", "Mia"]) == []
    assert not is_match(FRIENDS, [])
