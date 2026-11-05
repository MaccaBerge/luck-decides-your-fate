import random
import secrets

import pytest

from app.engine.spin_params import SpinParams, generate_spin_params


def test_default_ranges():
    rng = secrets.SystemRandom()
    seen_rot = set()
    for _ in range(1000):
        p = generate_spin_params(rng)
        assert isinstance(p, SpinParams)
        assert 0.08 <= p.landing_offset <= 0.92
        assert 5 <= p.extra_rotations <= 8
        assert isinstance(p.extra_rotations, int) and isinstance(p.duration_ms, int)
        assert 4500 <= p.duration_ms <= 7000
        seen_rot.add(p.extra_rotations)
    assert seen_rot == {5, 6, 7, 8}


def test_custom_duration_respected():
    rng = random.Random(5)
    durs = [generate_spin_params(rng, 300, 400).duration_ms for _ in range(1000)]
    assert min(durs) >= 300 and max(durs) <= 400
    assert min(durs) < 320 and max(durs) > 380


def test_fixed_duration():
    assert generate_spin_params(random.Random(1), 500, 500).duration_ms == 500


def test_min_greater_than_max_raises():
    with pytest.raises(ValueError):
        generate_spin_params(random.Random(1), 500, 400)
