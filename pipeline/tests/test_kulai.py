import json

from lega.config import WEB_DATA

LOOKUP = json.loads((WEB_DATA / "orientation_lookup.json").read_text())
LAYOUT = json.loads((WEB_DATA / "kulai_layout.json").read_text())


def at(tilt, az):
    return LOOKUP["kwh_kwp"][LOOKUP["tilts"].index(tilt)][LOOKUP["azimuths"].index(az % 360)]


def test_a_whole_gable_house_barely_cares_which_way_it_faces():
    # two opposite faces at 20°: turning the street grid changes the house total by well under 2%
    pairs = [(at(20, a) + at(20, a + 180)) / 2 for a in range(0, 180, 15)]
    assert (max(pairs) - min(pairs)) / max(pairs) < 0.02


def test_a_single_face_spread_is_small_at_the_equator():
    row = LOOKUP["kwh_kwp"][LOOKUP["tilts"].index(20)]
    assert (max(row) - min(row)) / max(row) < 0.05


def test_pitch_matters_more_than_direction():
    steep, low = at(30, 180), at(15, 180)
    pairs = [(at(20, a) + at(20, a + 180)) / 2 for a in range(0, 180, 15)]
    assert (low - steep) / low > (max(pairs) - min(pairs)) / max(pairs)


def test_yield_is_plausible_for_johor():
    assert 950 < LOOKUP["best"] < 1400
    assert 0.45 < LOOKUP["diffuse_share"] < 0.70


def test_layout_has_about_400_homes_and_community_plots():
    assert 350 <= len(LAYOUT["plots"]) <= 500
    assert {c["type"] for c in LAYOUT["community"]} >= {"school", "hall", "surau", "battery"}
    assert len({p["phase"] for p in LAYOUT["plots"]}) == 3
