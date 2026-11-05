import random
from dataclasses import dataclass


@dataclass(frozen=True)
class SpinParams:
    landing_offset: float     # uniform in [0.08, 0.92] — position inside the winning slice
    extra_rotations: int      # uniform int in [5, 8]
    duration_ms: int          # uniform int in [min_ms, max_ms]


def generate_spin_params(rng: random.Random, min_ms: int = 4500,
                         max_ms: int = 7000) -> SpinParams:
    if min_ms > max_ms:
        raise ValueError("min_ms must be <= max_ms")
    return SpinParams(
        landing_offset=rng.uniform(0.08, 0.92),
        extra_rotations=rng.randint(5, 8),
        duration_ms=rng.randint(min_ms, max_ms),
    )
