import json

import pytest

from lega import streetlights as S
from lega.config import WEB_DATA

CASES = json.loads(S.CASES.read_text())["cases"]
FLEET = json.loads((WEB_DATA / "streetlights.json").read_text())


@pytest.mark.parametrize("c", CASES)
def test_days_to_dark_matches_shared_cases(c):
    r = S.project(c["lamp"], c["days"])
    assert r["days_to_dark"] == c["expected"]["days_to_dark"]
    assert r["morning"] == pytest.approx(c["expected"]["morning"])


def test_shaded_old_lamp_goes_dark_in_rain_and_healthy_one_does_not():
    rainy = [3.5, 1.2, 0.8, 1.0, 3.6, 3.6, 3.6]
    assert S.project(CASES[0]["lamp"], rainy)["days_to_dark"] == 2
    assert S.project(CASES[1]["lamp"], [3.6] * 7)["days_to_dark"] is None


def test_night_use_includes_dimming():
    assert S.night_wh(30) == 30 * 8 + 30 * 4 * 0.5


def test_fleet_is_about_sixty_lamps_on_real_roads():
    assert 50 <= len(FLEET["lamps"]) <= 70
    assert len({L["road"] for L in FLEET["lamps"]}) >= 4
    for L in FLEET["lamps"]:
        assert 0.6 <= L["soh"] <= 1.0 and 0.5 <= L["shade"] <= 1.0
