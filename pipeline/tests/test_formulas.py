import json
from pathlib import Path

import pytest

from lega import formulas as f

CASES = json.loads((Path(__file__).resolve().parents[2] / "shared" / "formula_cases.json").read_text())


@pytest.mark.parametrize("c", CASES["sizing"])
def test_portfolio_sizing(c):
    assert f.need_yr(c["demand"], c["unit"]) == pytest.approx(c["need_yr"])
    sn = f.solar_need(c["demand"], c["unit"], c["share"])
    assert sn == pytest.approx(c["solar_need"])
    base = f.roofs_base(sn, c["avg_mwh_per_roof"])
    assert base == c["roofs_base"]
    assert f.roofs_needed(base, c["buffer"]) == c["roofs_needed"]


def test_rounding_is_half_up_like_js():
    assert f.roofs_needed(2, 0.25) == 3  # 2.5 -> 3, not banker's 2


@pytest.mark.parametrize("c", CASES["cover"])
def test_dropout_stress(c):
    covers = f.month_cover(c["roofs"], c["avg_mwh_per_roof"], c["monthly_share"], c["solar_need"])
    assert len(covers) == 12
    assert min(covers) == pytest.approx(c["min_cover"], abs=1e-3)
    assert f.dropout_cover(covers) == pytest.approx(c["dropout_cover"], abs=1e-3)


@pytest.mark.parametrize("c", CASES["enough"])
def test_enough_roofs(c):
    assert f.enough_roofs(c["good"], c["needed"]) is c["expected"]


@pytest.mark.parametrize("c", CASES["p90"])
def test_p90_coverage(c):
    assert f.p90_coverage(c["actual"], c["p90"]) == pytest.approx(c["expected"])
