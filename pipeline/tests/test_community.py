import json

import pytest

from lega.townships import read_township
from lega.config import WEB_DATA
from lega.townships import TOWNSHIPS, in_outline, outline

DIR = WEB_DATA / "community"
INDEX = json.loads((DIR / "index.json").read_text())
TOWN_INDEX = {m["id"]: m for m in json.loads((WEB_DATA / "townships" / "index.json").read_text())["townships"]}
BY_ID = {t["id"]: t for t in TOWNSHIPS}


def load(tid):
    return json.loads((DIR / f"{tid}.json").read_text())


@pytest.mark.parametrize("tid", [t["id"] for t in INDEX["townships"]])
def test_facilities_are_inside_the_township(tid):
    polys = outline(BY_ID[tid])
    for f in load(tid)["facilities"]:
        assert in_outline(f["lon"], f["lat"], polys), f["name"]


@pytest.mark.parametrize("tid", [t["id"] for t in INDEX["townships"]])
def test_no_roof_is_promised_twice(tid):
    p = load(tid)
    used = [r for f in p["facilities"] for r in f["own_roofs"] + f["shared_roofs"]]
    assert len(used) == len(set(used))
    roofs = set(read_township(tid)["id"])
    assert set(used) <= roofs


@pytest.mark.parametrize("tid", [t["id"] for t in INDEX["townships"]])
def test_street_lamps_never_go_dark(tid):
    for g in load(tid)["lamp_groups"]:
        if not g["ok"]:
            continue
        assert g["dark_nights"] == 0, g["id"]
        assert g["lowest_pct"] >= 19, f"{g['id']} dips below the 20% reserve"
        assert "roofs" not in g, "street lamps are standalone: they never take roofs"


@pytest.mark.parametrize("tid", [t["id"] for t in INDEX["townships"]])
def test_covered_facilities_cover_their_worst_month(tid):
    for f in load(tid)["facilities"]:
        assert (f["status"] == "short") == (f["cover_worst_month"] < 1), f["name"]


@pytest.mark.parametrize("tid", [t["id"] for t in INDEX["townships"]])
def test_business_builder_sees_the_reserved_roofs(tid):
    s = load(tid)["summary"]
    assert TOWN_INDEX[tid]["summary"]["community_reserved"] == s["good_roofs_reserved"]
    assert s["self"] + s["shared"] + s["short"] == s["facilities"]
    assert s["co2_t_yr"] == round(s["community_mwh_yr"] * INDEX["grid_t_co2_per_mwh"])
