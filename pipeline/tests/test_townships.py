import json

import pytest

from lega.config import WEB_DATA, YIELD_SANITY_RANGE

DIR = WEB_DATA / "townships"
INDEX = json.loads((DIR / "index.json").read_text())


@pytest.mark.parametrize("meta", INDEX["townships"], ids=lambda m: m["id"])
def test_township_file_is_consistent(meta):
    d = json.loads((DIR / f"{meta['id']}.json").read_text())
    n = len(d["id"])
    assert n == meta["summary"]["solar_ready"] > 0
    assert len(set(d["id"])) == n, "roof ids must be unique"
    assert all(len(p) >= 6 and len(p) % 2 == 0 for p in d["poly"]), "every roof needs >= 3 vertices"
    assert sum(s >= 75 for s in d["score"]) == meta["summary"]["good_roofs"]
    assert min(d["kwp"]) >= INDEX["min_kwp"]
    lo, hi = YIELD_SANITY_RANGE
    assert lo <= meta["summary"]["yield_kwh_kwp"] <= hi


@pytest.mark.parametrize("meta", INDEX["townships"], ids=lambda m: m["id"])
def test_polygons_decode_near_their_centroid(meta):
    d = json.loads((DIR / f"{meta['id']}.json").read_text())
    ox, oy = d["origin"]
    for i in range(0, len(d["id"]), max(1, len(d["id"]) // 50)):
        p = d["poly"][i]
        lats = [oy + p[k + 1] / 10 / d["ky"] for k in range(0, len(p), 2)]
        lons = [ox + p[k] / 10 / d["kx"] for k in range(0, len(p), 2)]
        assert min(lats) - 1e-4 <= d["cy"][i] <= max(lats) + 1e-4
        assert min(lons) - 1e-4 <= d["cx"][i] <= max(lons) + 1e-4


def test_sites_group_under_an_existing_township():
    ids = {m["id"] for m in INDEX["townships"]}
    for m in INDEX["townships"]:
        if m.get("parent"):
            assert m["parent"] in ids and m["parent"] != m["id"]
            assert m.get("site"), "a grouped site needs a toggle label"


@pytest.mark.parametrize("meta", INDEX["townships"], ids=lambda m: m["id"])
def test_every_roof_lies_inside_the_township_outline(meta):
    """Regression: the scan used to take every building in the bounding box, which pulled
    neighbouring villages (e.g. Kampung Kubu Gajah) into City of Elmina."""
    from lega.townships import TOWNSHIPS, in_outline, outline

    polys = outline(next(t for t in TOWNSHIPS if t["id"] == meta["id"]))
    d = json.loads((DIR / f"{meta['id']}.json").read_text())
    assert all(in_outline(x, y, polys) for x, y in zip(d["cx"], d["cy"]))


def test_elmina_excludes_kampung_kubu_gajah():
    # Kampung Kubu Gajah, OSM way 708366159, lies north-east of Elmina's outline (lat 3.188–3.213, lon 101.508–101.530)
    d = json.loads((DIR / "elmina.json").read_text())
    in_kubu_core = sum(3.195 <= y <= 3.21 and 101.512 <= x <= 101.527 for x, y in zip(d["cx"], d["cy"]))
    assert in_kubu_core == 0
