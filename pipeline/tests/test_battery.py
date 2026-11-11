import json

import pytest

from lega import battery as B

CASES = {c["name"]: c for c in json.loads(B.CASES.read_text())["cases"]}


@pytest.mark.parametrize("name", list(CASES))
def test_dispatch_matches_shared_cases(name):
    c = CASES[name]
    r = B.dispatch(c["pv"], c["load"], c["crit"], c["cap"], c["rain"], c["start_soc"], c["outage_from"])
    for k, v in c["expected"].items():
        assert r[k] == pytest.approx(v, abs=1e-6), k


def test_storm_raises_the_reserve_to_full():
    c = CASES["storm"]
    r = B.dispatch(c["pv"], c["load"], c["crit"], c["cap"], c["rain"], 0.6)
    assert r["reserve"][20] == 1.0 and r["reserve"][39] == 1.0   # within 24 h of the 15 mm/h hour
    assert r["reserve"][10] == B.RESERVE and r["reserve"][41] == B.RESERVE
    assert r["soc"][39] == pytest.approx(1.0)


def test_outage_goes_dark_at_the_right_hour():
    # 30 kWh battery at 60%: 18 kWh x 0.95 = 17.1 kWh; a 2 kW load at night with the grid down
    # lasts 8 full hours, and the 9th hour (hour 8) runs short.
    pv = [0.0] * 48
    load = [2.0] * 48
    r = B.dispatch(pv, load, load, 30.0, [0.0] * 48, 0.6, outage_from=0)
    assert not any(r["dark"][:8]) and r["dark"][8]
    assert B.hours_until_dark(pv, load, 30.0, 0.6, [0.0] * 48, 0) == 8


def test_no_grid_import_or_export_during_an_outage():
    c = CASES["outage"]
    assert all(i == 0 and e == 0 for i, e in zip(c["expected"]["imp"][20:], c["expected"]["exp"][20:]))
