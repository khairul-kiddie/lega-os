"""Portfolio sizing formulas. Mirrored exactly in web/src/lib/formulas.ts;
both are tested against shared/formula_cases.json."""
import math
from typing import Sequence

DROPOUT_RATE = 0.20
BUFFERS = {"lean": 0.0, "balanced": 0.15, "monsoon": 0.25}
PATTERN_SHARE = {"office": 0.95, "mall": 0.70, "24h": 0.45}  # placeholders, see README


def round_half_up(x: float) -> int:
    # JS Math.round semantics; Python's round() is banker's rounding.
    return math.floor(x + 0.5)


def need_yr(demand: float, unit: str) -> float:
    return demand * (12 if unit == "month" else 1)


def solar_need(demand: float, unit: str, pattern_share: float) -> float:
    return need_yr(demand, unit) * pattern_share


def roofs_base(solar_need_mwh: float, avg_mwh_per_roof: float) -> int:
    return math.ceil(solar_need_mwh / avg_mwh_per_roof)


def roofs_needed(base: int, buffer: float) -> int:
    return round_half_up(base * (1 + buffer))


def month_cover(roofs: int, avg_mwh_per_roof: float, monthly_share: Sequence[float], solar_need_mwh: float) -> list[float]:
    """supply[m] = roofs × avg annual MWh per roof × share of annual yield in month m."""
    target = solar_need_mwh / 12
    return [roofs * avg_mwh_per_roof * s / target for s in monthly_share]


def dropout_cover(covers: Sequence[float], rate: float = DROPOUT_RATE) -> float:
    return min(covers) * (1 - rate)


def enough_roofs(good_roofs_by_township: Sequence[int], needed: int) -> bool:
    return sum(good_roofs_by_township) >= needed


def p90_coverage(actual: Sequence[float], p90: Sequence[float]) -> float:
    """Share of days where delivered energy met the P90 promise."""
    if not actual:
        return 0.0
    return sum(a >= p for a, p in zip(actual, p90)) / len(actual)
