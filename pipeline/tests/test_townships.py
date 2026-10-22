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
