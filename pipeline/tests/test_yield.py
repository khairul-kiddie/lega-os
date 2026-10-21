import json

from lega.config import WEB_DATA, YIELD_SANITY_RANGE


def test_yield_sanity():
    y = json.loads((WEB_DATA / "yield.json").read_text())
    lo, hi = YIELD_SANITY_RANGE
    assert lo <= y["annual_kwh_per_kwp"] <= hi
    assert y["sanity"]["ok"] is True
    assert len(y["monthly"]) == 12
    assert abs(sum(m["kwh_per_kwp"] for m in y["monthly"]) - y["annual_kwh_per_kwp"]) < 15
