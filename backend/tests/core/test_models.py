import json

from app.models import AdminGameState, PublicGameState, SpinStarted

FORBIDDEN = {"mode", "target_names", "label", "origin", "rule_status", "rule_applied",
             "matched_target", "matched_entry_ids"}


def _all_property_names(schema: dict) -> set[str]:
    names: set[str] = set()

    def walk(node):
        if isinstance(node, dict):
            props = node.get("properties")
            if isinstance(props, dict):
                names.update(props.keys())
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(schema)
    return names


def test_public_state_has_no_rig_keys():
    names = _all_property_names(PublicGameState.model_json_schema())
    assert names, "schema walk found no properties"
    assert not (names & FORBIDDEN)
    assert not any(n.startswith("matched") for n in names)


def test_spin_started_has_no_rig_keys():
    names = _all_property_names(SpinStarted.model_json_schema())
    assert not (names & FORBIDDEN)


def test_admin_state_has_rig_keys():
    # sanity check that the walker actually detects these keys
    names = _all_property_names(AdminGameState.model_json_schema())
    assert {"rule_status", "rule_applied", "mode", "target_names"} <= names
    json.dumps(AdminGameState.model_json_schema())
