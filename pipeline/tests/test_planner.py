import json

import pytest

from lega import planner as P
from lega.config import WEB_DATA

CASES = json.loads(P.CASES.read_text())
DATA = json.loads((WEB_DATA / "load_profiles.json").read_text())


@pytest.mark.parametrize("c", CASES["assets"], ids=lambda c: f"{c['type']}-{c['input']['goal']}")
def test_plan_matches_shared_cases(c):
    r = P.plan_asset(c["input"], {"kw": c["kw"], "emergency_kw": c["emergency_kw"]}, CASES["solar_shape"], c["specific_yield"], c["wettest_week_day"])
    for k, v in c["expected"].items():
        assert r[k] == pytest.approx(v, abs=1e-3), k


def test_battery_formula():
    # max(night, critical x hours) / (0.9 DoD x 0.95 efficiency)
    assert P.battery_kwh(30, 4, 48) == pytest.approx(192 / 0.855)
    assert P.battery_kwh(300, 4, 48) == pytest.approx(300 / 0.855)


def test_outage_battery_covers_the_backup_hours():
    for c in CASES["assets"]:
        if c["input"]["goal"] != "bills":
            assert c["expected"]["backup_hours"] >= c["input"]["backup_hours"] - 1e-6


def test_wettest_week_check():
    prof = {"kw": [1.0] * 24}
    a = {"annual_kwh": 24 * 365, "goal": "both", "backup_hours": 48, "own_roof_kwp": 100, "roof_kwp": 100}
    shape = DATA["solar_shape"]
    sunny = P.plan_asset(a, prof, shape, 1300, 3.5)
    dark = P.plan_asset(a, prof, shape, 1300, 0.5)
    assert sunny["wettest_week_ok"] and not dark["wettest_week_ok"]
    assert dark["wettest_week_hours"] < 168
    # adding the suggested solar passes the week
    week = dark["kwp_wettest"] * 0.5 * 7 + dark["battery_kwh"] * P.DOD * P.EFF
    assert week >= 24 * 7 - 1e-6


def test_bills_only_needs_no_battery_and_is_bill_neutral():
    c = next(c for c in CASES["assets"] if c["input"]["goal"] == "bills")
    assert c["expected"]["battery_kwh"] == 0 and c["expected"]["bill_neutral"]


@pytest.mark.parametrize("c", CASES["priority"])
def test_priority(c):
    assert P.priority(c["criticality"], c["people"], c["flood_zone"], c["bill_rm_yr"]) == c["expected"]


def test_profiles_match_their_typical_size():
    for k, p in DATA["profiles"].items():
        assert sum(p["kw"]) * 365 == pytest.approx(p["typical_kwh"], rel=0.01), k


def test_wettest_week_is_darker_than_average():
    for tid, t in DATA["townships"].items():
        assert 0 < t["p90_kwh_kwp_day"] < t["typical_kwh_kwp_day"], tid
