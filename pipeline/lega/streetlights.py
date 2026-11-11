"""Street-light watch: a SAMPLE fleet of standalone solar street lamps on real City of Elmina roads.

Road geometry and names are real (OpenStreetMap, cached by community.py). Each lamp's panel, battery,
battery health, LED, tree shade and current charge are SAMPLE values (fixed seed) until SDP or the
council has a lamp register and telemetry.

The risk model (mirrored in web/src/lib/streetlights.ts, tested against shared/streetlight_cases.json):
each day the lamp charges from the forecast's P90 kWh per kWp x panel kWp x shade x charging efficiency,
then runs the night (full power 7 pm - 1 am and 5 am - 7 am, 50% from 1 am to 5 am). A lamp is
"at risk" the first morning its charge falls below 10% of its usable capacity.

Output: web/public/data/streetlights.json
"""
import json
import math
import random

from .community import CACHE, M_PER_DEG_LAT
from .config import WEB_DATA

OUT = WEB_DATA / "streetlights.json"
CASES = WEB_DATA.parents[2] / "shared" / "streetlight_cases.json"
SEED = 7
SPACING_M = 40
CENTRE = (101.5118, 3.1785)   # Elmina Gardens / Elmina Ilham area
RADIUS_M = 700
ROADS_WANTED = 5
LAMPS_WANTED = 60
FULL_HOURS, DIM_HOURS, DIM_LEVEL = 8, 4, 0.5
CHARGE_EFF = 0.85
AT_RISK = 0.10
HORIZON = 7


# ---------------------------------------------------------------- model (mirror streetlights.ts)
def night_wh(led_w: float) -> float:
    return led_w * (FULL_HOURS + DIM_HOURS * DIM_LEVEL)


def project(lamp: dict, kwh_kwp_days: list[float]) -> dict:
    """Morning charge (share of usable capacity) for each forecast day, and the first day it is at risk."""
    cap = lamp["battery_wh"] * lamp["soh"]
    soc = lamp["charge"] * cap
    need = night_wh(lamp["led_w"])
    morning, dark_day = [], None
    for i, k in enumerate(kwh_kwp_days[:HORIZON]):
        soc = min(cap, soc + lamp["panel_wp"] * k * lamp["shade"] * CHARGE_EFF) - need
        soc = max(0.0, soc)
        morning.append(soc / cap)
        if dark_day is None and soc < AT_RISK * cap:
            dark_day = i + 1
    return {"morning": morning, "days_to_dark": dark_day}


# ---------------------------------------------------------------- fleet
def _roads():
    osm = json.loads((CACHE / "elmina.json").read_text())
    kx = M_PER_DEG_LAT * math.cos(math.radians(CENTRE[1]))
    d = lambda p: math.hypot((p[0] - CENTRE[0]) * kx, (p[1] - CENTRE[1]) * M_PER_DEG_LAT)
    roads: dict[str, list] = {}
    for el in osm["elements"]:
        t = el["tags"]
        if el["type"] != "way" or not t.get("name") or t.get("highway") not in ("residential", "tertiary", "secondary", "unclassified", "living_street"):
            continue
        pts = []
        carry = SPACING_M / 2
        for a, b in zip(el["geom"], el["geom"][1:]):
            seg = math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * M_PER_DEG_LAT)
            x = carry
            while x <= seg:
                k = x / seg
                p = (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)
                if d(p) <= RADIUS_M:
                    pts.append(p)
                x += SPACING_M
            carry = x - seg
        if pts:
            roads.setdefault(t["name"], []).extend(pts)
    return roads


def _spec(rng) -> dict:
    """Panel and battery sized to the LED, as installers do (about 2.5x the night's energy, 2-3 nights)."""
    led = rng.choice([20, 25, 30, 30, 40])
    need = night_wh(led)
    return {"led_w": led, "panel_wp": int(round(need * rng.uniform(0.55, 0.8) / 10) * 10),
            "battery_wh": int(round(need * rng.choice([2.0, 2.5, 3.0]) / 50) * 50), "soh": round(rng.uniform(0.6, 1.0), 2)}


def build_fleet() -> list[dict]:
    rng = random.Random(SEED)
    roads = sorted(_roads().items(), key=lambda kv: -len(kv[1]))[:ROADS_WANTED]
    total = sum(len(p) for _, p in roads)
    lamps = []
    for name, pts in roads:
        n = max(6, round(LAMPS_WANTED * len(pts) / total))
        step = max(1, len(pts) / n)
        chosen = [pts[int(i * step)] for i in range(min(n, len(pts)))]
        shaded_run = rng.random() < 0.6  # some roads have a row of mature trees
        for i, p in enumerate(chosen):
            shade = round(rng.uniform(0.5, 0.9), 2) if (shaded_run and rng.random() < 0.45) or rng.random() < 0.1 else 1.0
            lamps.append({
                "id": f"SL-{len(lamps) + 1:03d}", "road": name, "lat": round(p[1], 6), "lon": round(p[0], 6),
                **_spec(rng),
                "shade": shade, "charge": round(rng.uniform(0.6, 1.0), 2),
            })
    # an ageing fleet: about one lamp in six has a worn battery and/or a tree grown over its panel
    for L in rng.sample(lamps, len(lamps) // 6):
        L["soh"] = round(rng.uniform(0.6, 0.72), 2)
        L["shade"] = round(rng.uniform(0.5, 0.65), 2) if rng.random() < 0.7 else L["shade"]
        L["charge"] = round(rng.uniform(0.35, 0.7), 2)
    return lamps


def write_cases():
    lamp = {"panel_wp": 250, "battery_wh": 500, "soh": 0.8, "led_w": 30, "shade": 0.6, "charge": 0.7}
    days = [3.5, 1.2, 0.8, 1.0, 3.6, 3.6, 3.6]
    sunny = [3.6] * 7
    CASES.write_text(json.dumps({
        "_note": "Generated by pipeline/lega/streetlights.py; pytest and web/src/lib/streetlights.test.ts check both mirrors.",
        "cases": [{"lamp": lamp, "days": days, "expected": project(lamp, days)},
                  {"lamp": {**lamp, "shade": 1.0, "soh": 1.0}, "days": sunny, "expected": project({**lamp, "shade": 1.0, "soh": 1.0}, sunny)}],
    }, indent=1))


def run():
    lamps = build_fleet()
    OUT.write_text(json.dumps({
        "sample": True,
        "note": "Roads are real (OpenStreetMap). Lamp specs, battery health, shade and charge are SAMPLE values until SDP has a lamp register and telemetry.",
        "full_hours": FULL_HOURS, "dim_hours": DIM_HOURS, "dim_level": DIM_LEVEL, "charge_eff": CHARGE_EFF,
        "at_risk": AT_RISK, "horizon_days": HORIZON, "precinct": "Elmina Gardens precinct, City of Elmina",
        "lamps": lamps}, indent=1))
    write_cases()
    live = json.loads((WEB_DATA / "forecast_live.json").read_text())
    k = [d["kwh_kwp"]["p90"] for d in live["days"]]
    risk = [project(L, k)["days_to_dark"] for L in lamps]
    roads = sorted({L["road"] for L in lamps})
    print(f"street lamps: {len(lamps)} on {len(roads)} roads ({', '.join(roads)}); "
          f"at risk this week on the current forecast: {sum(r is not None for r in risk)}")


if __name__ == "__main__":
    run()
