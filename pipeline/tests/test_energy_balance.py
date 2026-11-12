import json

import pytest

from lega.config import WEB_DATA
from lega.energy_balance import HOME_KWH_YR, dwellings

DATA = json.loads((WEB_DATA / "energy_balance.json").read_text())
TOWNS = {t["id"]: t for t in json.loads((WEB_DATA / "townships" / "index.json").read_text())["townships"]}
COMM = {t["id"]: t for t in json.loads((WEB_DATA / "community" / "index.json").read_text())["townships"]}


@pytest.mark.parametrize("row", DATA["townships"], ids=lambda r: r["id"])
def test_parts_add_up(row):
    assert row["generation_mwh"] == pytest.approx(sum(row["generation_by_roof"].values()), abs=0.5)
    assert row["use_mwh"] == pytest.approx(sum(row["use"].values()), abs=0.5)
    assert row["cover"] == pytest.approx(row["generation_mwh"] / row["use_mwh"], abs=1e-3)
    assert all(v >= 0 for v in [*row["use"].values(), *row["generation_by_roof"].values()])


@pytest.mark.parametrize("row", DATA["townships"], ids=lambda r: r["id"])
def test_matches_the_scan_and_the_community_plan(row):
    # generation is the same roof total the Roof map shows; community and lamp use come from the community plan
    assert row["generation_mwh"] == pytest.approx(TOWNS[row["id"]]["summary"]["mwh_yr"], rel=0.01)
    assert row["use"]["community"] == pytest.approx(COMM[row["id"]]["summary"]["facility_mwh_yr"], abs=0.1)
    assert row["use"]["lamps"] == pytest.approx(COMM[row["id"]]["summary"]["lamp_mwh_yr"], abs=0.1)
    assert row["use"]["homes"] == pytest.approx(row["homes"] * HOME_KWH_YR / 1000, abs=0.1)


def test_dwellings():
    assert dwellings("house", 1, 150) == 1
    assert dwellings("terrace", 6, 660) == 6
    assert dwellings("apartment", 1, 900) == 50  # 900 m2 x 5 floors / 90 m2
    assert dwellings("commercial", 1, 5000) == 0
