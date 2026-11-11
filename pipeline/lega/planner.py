"""Community energy planner: sample load profiles, each township's wettest week, and the sizing
formulas. The formulas are mirrored exactly in web/src/lib/planner.ts; both are tested against
shared/planner_cases.json.

Load profiles are SAMPLE shapes (kW for each hour of an average day at a typical size) until SDP
has smart-meter data. Solar shape, yield and the wettest week are real (NASA POWER 2015-2025, pvlib).

Output: web/public/data/load_profiles.json
"""
import json
import math

import numpy as np

from . import nasa_power
from .config import SITE, WEB_DATA
from .simulate import hourly_from_daily
from .townships import TOWNSHIPS, outline, outline_bbox

OUT = WEB_DATA / "load_profiles.json"

DOD, EFF = 0.9, 0.95          # usable share of a battery, and its efficiency
NIGHT_SOLAR = 0.05            # an hour counts as night when solar is under 5% of its noon peak
PANEL_W = 550                 # one modern rooftop panel
CRITICALITY = {"critical": 100, "essential": 60, "standard": 20}
PEOPLE_FULL, BILL_FULL_RM = 1500, 150_000  # people served / yearly bill that score 100
ECONOMICS = {  # SAMPLE values, see README
    "tariff_rm_kwh": 0.50,            # what a community building pays TNB
    "battery_rm_kwh": 1800,           # installed lithium battery
    "second_life_rm_kwh": 900,        # second-life EV pack
    "solar_rm_kwp": 2800,             # installed rooftop solar
    "commercial_margin_rm_kwh": 0.08, # SDP's margin on each kWh sold to a business buyer
    "payback_years": 10,
}


def _profile(points: dict[int, float], base: float) -> list[float]:
    """24 hourly values: base load plus the given hours."""
    return [round(base + points.get(h, 0.0), 2) for h in range(24)]


def _scale_to(kw: list[float], annual_kwh: float) -> list[float]:
    k = annual_kwh / (sum(kw) * 365)
    return [round(v * k, 2) for v in kw]


def build_profiles() -> dict:
    school_day = {h: 1.0 for h in range(7, 17)} | {7: 0.7, 12: 0.8, 16: 0.6}
    surau = {5: 1.0, 6: 0.6, 13: 0.9, 14: 0.4, 16: 0.6, 17: 0.4, 19: 1.0, 20: 1.0, 21: 0.7}
    hall = {18: 0.6, 19: 1.0, 20: 1.0, 21: 0.8, 10: 0.3, 11: 0.3, 14: 0.3, 15: 0.3}
    clinic = {h: 1.0 for h in range(8, 22)} | {8: 0.6, 21: 0.5}
    office = {h: 1.0 for h in range(8, 18)} | {8: 0.6, 17: 0.6}
    mall = {h: 1.0 for h in range(10, 22)} | {10: 0.7, 21: 0.7}
    p = {
        "school": {"label": "School", "note": "Weekday 7 am – 5 pm peak, low at night, lower in school holidays",
                   "kw": _profile(school_day, 0.08), "typical_kwh": 150_000, "people": 1200, "own_kwp": 120,
                   "criticality": "essential", "ownership": "handed",
                   "month": [0.9, 1, 1, 1, 1, 0.75, 1, 1, 1, 1, 0.95, 0.6]},
        "surau": {"label": "Surau / mosque", "note": "Peaks at dawn, midday, afternoon and evening prayers",
                  "kw": _profile(surau, 0.12), "typical_kwh": 18_000, "people": 300, "own_kwp": 20,
                  "criticality": "essential", "ownership": "handed", "month": [1] * 12},
        "hall": {"label": "Community hall / evacuation centre (PPS)",
                 "note": "Low most days; in an emergency it runs 24 hours at a higher load",
                 "kw": _profile(hall, 0.15), "emergency_kw": _profile({}, 0.5), "typical_kwh": 25_000, "people": 500,
                 "own_kwp": 40, "criticality": "critical", "ownership": "sdp", "month": [1] * 12},
        "guardhouse": {"label": "Guardhouse", "note": "Flat, 24 hours a day", "kw": _profile({}, 1.0),
                       "typical_kwh": 7_000, "people": 2000, "own_kwp": 3, "criticality": "essential",
                       "ownership": "sdp", "month": [1] * 12},
        "clinic": {"label": "Clinic", "note": "8 am – 10 pm, fridges all night", "kw": _profile(clinic, 0.25),
                   "typical_kwh": 30_000, "people": 800, "own_kwp": 30, "criticality": "critical",
                   "ownership": "private", "month": [1] * 12},
        "commercial": {"label": "Commercial buyer", "note": "Office, mall or 24-hour business. Funds community projects",
                       "kw": _profile(office, 0.1), "variants": {"office": _profile(office, 0.1), "mall": _profile(mall, 0.15),
                                                                 "24h": _profile({}, 1.0)},
                       "typical_kwh": 1_800_000, "people": 0, "own_kwp": 0, "criticality": "standard",
                       "ownership": "private", "month": [1] * 12},
    }
    for v in p.values():  # store kW at the typical size
        k = v["typical_kwh"] / (sum(v["kw"]) * 365)
        for key in ("kw", "emergency_kw"):
            if key in v:
                v[key] = [round(x * k, 3) for x in v[key]]
        if "variants" in v:
            v["variants"] = {n: _scale_to(kw, v["typical_kwh"]) for n, kw in v["variants"].items()}
    return p


# ---------------------------------------------------------------- formulas (mirror planner.ts)
def scale(kw, annual_kwh):
    return annual_kwh / (sum(kw) * 365)


def night_kwh_day(kw, solar_shape, annual_kwh):
    s = scale(kw, annual_kwh)
    return sum(v * s for v, sh in zip(kw, solar_shape) if sh < NIGHT_SOLAR)


def critical_kw(kw, annual_kwh, emergency_kw=None):
    s = scale(kw, annual_kwh)
    return (sum(emergency_kw) / 24 if emergency_kw else sum(kw) / 24) * s


def battery_kwh(night_kwh, crit_kw, backup_hours):
    return max(night_kwh, crit_kw * backup_hours) / (DOD * EFF)


def plan_asset(a: dict, prof: dict, solar_shape, specific_yield, wettest_week_day) -> dict:
    """a: annual_kwh, goal (bills|outage|both), backup_hours, own_roof_kwp, roof_kwp (avg leased roof)."""
    kw, em = prof["kw"], prof.get("emergency_kw")
    annual = a["annual_kwh"]
    outage = a["goal"] in ("outage", "both")
    night = night_kwh_day(kw, solar_shape, annual)
    crit = critical_kw(kw, annual, em)
    kwp_bill = annual / specific_yield
    kwp_outage = crit * 24 * 365 / specific_yield
    kwp = max(kwp_bill if a["goal"] != "outage" else 0, kwp_outage if outage else 0)
    batt = battery_kwh(night, crit, a["backup_hours"]) if outage else 0.0
    week_energy = kwp * wettest_week_day * 7 + batt * DOD * EFF
    week_need = crit * 24 * 7
    own = min(kwp, a["own_roof_kwp"])
    leased = math.ceil((kwp - own) / a["roof_kwp"] - 1e-9) if kwp > own else 0
    return {
        "kwp": kwp, "kwp_bill": kwp_bill, "battery_kwh": batt, "night_kwh_day": night, "critical_kw": crit,
        "panels": math.ceil(kwp * 1000 / PANEL_W - 1e-9),
        "own_kwp": own, "leased_roofs": leased,
        "bill_neutral": kwp * specific_yield >= annual - 1e-6,
        "wettest_week_ok": (not outage) or week_energy >= week_need - 1e-6,
        "wettest_week_hours": min(168.0, week_energy / crit) if crit else 168.0,
        "backup_hours": batt * DOD * EFF / crit if crit else 0.0,
        # solar that would carry the critical load through the wettest week with this battery
        "kwp_wettest": max(kwp, (week_need - batt * DOD * EFF) / (wettest_week_day * 7)) if outage else kwp,
    }


def priority(criticality: str, people: float, flood_zone: bool, bill_rm_yr: float) -> int:
    return round(0.40 * CRITICALITY[criticality] + 0.25 * min(1, people / PEOPLE_FULL) * 100
                 + 0.20 * (100 if flood_zone else 0) + 0.15 * min(1, bill_rm_yr / BILL_FULL_RM) * 100)


def funding_mwh(battery_kwh_: float, battery_rm_kwh: float, eco=ECONOMICS) -> float:
    """Commercial MWh a year whose margin pays the battery back within payback_years."""
    return battery_kwh_ * battery_rm_kwh / (eco["commercial_margin_rm_kwh"] * 1000 * eco["payback_years"])


# ---------------------------------------------------------------- data
def solar_shape(lat, lon) -> list[float]:
    h = hourly_from_daily(nasa_power.load(lat, lon), {"lat": lat, "lon": lon})
    s = h["ac_w"].groupby(h.index.hour).mean()
    return [round(float(v / s.max()), 3) for v in s.reindex(range(24), fill_value=0)]


def wettest_week(lat, lon) -> dict:
    """P90 wettest week: each year's darkest 7 days, then the value 90% of years beat."""
    from .community import daily_yield
    dates, y = daily_yield(lat, lon)
    years = np.array([int(d[:4]) for d in dates])
    worst = []
    for yr in sorted(set(years)):
        yy = y[years == yr]
        if len(yy) >= 300:
            worst.append(np.convolve(yy, np.ones(7) / 7, "valid").min())
    return {"p90_kwh_kwp_day": round(float(np.percentile(worst, 10)), 3), "typical_kwh_kwp_day": round(float(y.mean()), 3),
            "specific_yield": round(float(y.sum() / (len(y) / 365.25)), 1), "years": len(worst)}


CASES = WEB_DATA.parents[2] / "shared" / "planner_cases.json"


def write_cases(d: dict):
    """Shared test cases: the TypeScript mirror must give the same answers (planner.test.ts)."""
    sh, t = d["solar_shape"], d["townships"]["elmina"]
    assets = []
    for typ, goal, hrs, annual, own, roof in [("hall", "both", 48, 25000, 40, 120), ("school", "bills", 0, 150000, 120, 120),
                                              ("surau", "outage", 24, 18000, 5, 60), ("guardhouse", "both", 72, 7000, 3, 60),
                                              ("clinic", "both", 12, 30000, 0, 90)]:
        prof = d["profiles"][typ]
        a = {"annual_kwh": annual, "goal": goal, "backup_hours": hrs, "own_roof_kwp": own, "roof_kwp": roof}
        r = plan_asset(a, prof, sh, t["specific_yield"], t["p90_kwh_kwp_day"])
        assets.append({"type": typ, "input": a, "specific_yield": t["specific_yield"], "wettest_week_day": t["p90_kwh_kwp_day"],
                       "kw": prof["kw"], "emergency_kw": prof.get("emergency_kw"),
                       "expected": {k: round(v, 4) if isinstance(v, float) else v for k, v in r.items()}})
    pri = [{"criticality": "critical", "people": 500, "flood_zone": True, "bill_rm_yr": 12500},
           {"criticality": "standard", "people": 3000, "flood_zone": False, "bill_rm_yr": 300000},
           {"criticality": "essential", "people": 0, "flood_zone": False, "bill_rm_yr": 0}]
    for c in pri:
        c["expected"] = priority(c["criticality"], c["people"], c["flood_zone"], c["bill_rm_yr"])
    CASES.write_text(json.dumps({"_note": "Generated by pipeline/lega/planner.py; pytest and web/src/lib/planner.test.ts check both mirrors.",
                                 "solar_shape": sh, "assets": assets, "priority": pri,
                                 "funding": [{"battery_kwh": 200, "battery_rm_kwh": 1800, "expected": funding_mwh(200, 1800)}]}, indent=1))


def run():
    shape = solar_shape(SITE["lat"], SITE["lon"])
    towns = {}
    for t in TOWNSHIPS:
        s, n, w, e = outline_bbox(outline(t))
        towns[t["id"]] = wettest_week((s + n) / 2, (w + e) / 2)
    kulai = WEB_DATA / "kulai_layout.json"  # design-stage township: NASA POWER hourly, see kulai.py
    if kulai.exists():
        towns["kulai"] = json.loads(kulai.read_text())["daily"]
    data = {
        "sample": True,
        "note": "Load profiles are sample shapes until SDP has meter data. Solar shape, yield and wettest week: NASA POWER 2015-2025 + pvlib.",
        "solar_shape": shape, "night_threshold": NIGHT_SOLAR, "dod": DOD, "eff": EFF, "panel_w": PANEL_W,
        "criticality": CRITICALITY, "people_full": PEOPLE_FULL, "bill_full_rm": BILL_FULL_RM,
        "economics": ECONOMICS, "profiles": build_profiles(), "townships": towns,
    }
    OUT.write_text(json.dumps(data, indent=1))
    write_cases(data)
    el = towns["elmina"]
    print(f"load profiles: {len(data['profiles'])} types · Elmina yield {el['specific_yield']} kWh/kWp, "
          f"P90 wettest week {el['p90_kwh_kwp_day']} kWh/kWp/day (typical {el['typical_kwh_kwp_day']})")


if __name__ == "__main__":
    run()
