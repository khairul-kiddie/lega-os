"""SAMPLE layout for SDP's Kulai township (design stage, no buildings yet): about 400 residential plots in
three phases, community plots, and a flood-risk strip along a river. Fixed seed. Replace with SDP's
Kulai masterplan (CAD/GIS export).

Also adds Kulai's daily yield and P90 wettest week (NASA POWER hourly, see kulai_orientation.py) so the
Community energy planner can size Kulai's community buildings.

Output: web/public/data/kulai_layout.json
"""
import json
import random

import numpy as np

from .kulai_orientation import KULAI, OUT as LOOKUP

OUT = LOOKUP.parent / "kulai_layout.json"
SEED = 11
SITE_W, SITE_H = 600, 430       # metres (drawn compactly: parks, roads and buffers left out)
FLOOD_Y = 60                   # flood-risk strip: y < 130 m (river on the south edge)
ROAD = 12                       # road reserve between blocks
LANE = 6                        # back lane between the two rows of a block

HOUSE_TYPES = {
    "terrace":     {"label": "2-storey terrace", "roof": "gable", "pitch": 20, "usable": 0.45, "height": 9, "w": 6.7, "d": 18, "use_kwh": 4800},
    "terrace_hip": {"label": "2-storey terrace (hip)", "roof": "hip", "pitch": 25, "usable": 0.30, "height": 9, "w": 6.7, "d": 18, "use_kwh": 4800},
    "semid":       {"label": "Semi-D", "roof": "gable", "pitch": 22, "usable": 0.45, "height": 10, "w": 12, "d": 18, "use_kwh": 7200},
    "shophouse":   {"label": "3-storey shophouse", "roof": "flat", "pitch": 5, "usable": 0.60, "height": 13, "w": 6.7, "d": 22, "use_kwh": 9000},
}
ROOF_FORMS = {"gable": {"usable": 0.45, "faces": [0, 180]}, "hip": {"usable": 0.30, "faces": [0, 90, 180, 270]},
              "flat": {"usable": 0.60, "faces": [180]}}

# phase -> x range and the house types of its blocks (cycled)
PHASES = [
    {"id": 1, "name": "Phase 1", "x": (10, 195), "blocks": ["terrace", "terrace", "terrace_hip", "terrace"]},
    {"id": 2, "name": "Phase 2", "x": (205, 390), "blocks": ["terrace_hip", "semid", "terrace", "semid"]},
    {"id": 3, "name": "Phase 3", "x": (400, 585), "blocks": ["semid", "terrace", "semid", "terrace_hip"]},
]
COMMUNITY = [
    {"id": "C1", "type": "school", "name": "SK Kulai Sample", "phase": 1, "x": 100, "y": 395, "w": 70, "d": 34, "footprint_m2": 4200},
    {"id": "C2", "type": "hall", "name": "Dewan Komuniti Kulai (PPS)", "phase": 2, "x": 282, "y": 392, "w": 46, "d": 30, "footprint_m2": 1600},
    {"id": "C3", "type": "surau", "name": "Surau Kulai Sample", "phase": 3, "x": 492, "y": 30, "w": 30, "d": 24, "footprint_m2": 700},
    {"id": "C4", "type": "battery", "name": "Shared battery site", "phase": 2, "x": 352, "y": 385, "w": 22, "d": 18, "footprint_m2": 0},
]


def build_plots(rng) -> list[dict]:
    """Two columns of blocks per phase, five block rows, parks between them. Each block = two back-to-back rows."""
    plots = []
    for ph in PHASES:
        x0, x1 = ph["x"]
        col_w = (x1 - x0 - 10) / 2
        bi = 0
        for r in range(4):
            y = (FLOOD_Y + 8 if ph["id"] != 3 else 46) + r * 72   # phase 3 dips into the flood strip (a planning flag)
            for c in range(2):
                kind = ph["blocks"][bi % len(ph["blocks"])]
                bi += 1
                t = HOUSE_TYPES[kind]
                n = 10 if kind != "semid" else 6
                bx = x0 + c * (col_w + 10) + (col_w - n * t["w"]) / 2
                # some terrace blocks end in 3-storey shophouses at the corner (mixed-use street)
                shop_end = rng.choice(["east", "west"]) if kind.startswith("terrace") and rng.random() < 0.5 else None
                for row, ry in enumerate((y + t["d"] / 2, y + t["d"] + LANE + t["d"] / 2)):
                    for i in range(n):
                        k = "shophouse" if shop_end and ((shop_end == "east" and i >= n - 2) or (shop_end == "west" and i < 2)) else kind
                        ht = HOUSE_TYPES[k]
                        plots.append({"id": f"P{ph['id']}-{len(plots) + 1:04d}", "phase": ph["id"], "type": k,
                                      "x": round(bx + t["w"] * i + t["w"] / 2, 1), "y": round(ry, 1), "w": t["w"], "d": ht["d"],
                                      "row": f"{ph['id']}-{bi}-{row}", "footprint_m2": round(t["w"] * ht["d"] * 0.85, 1)})
    return plots


def shading(plots) -> None:
    """SAMPLE rule: a neighbour >= 3 m taller within 8 m to the east or west shades a home's roof
    (low equatorial morning and evening sun): 20% loss next door, 10% one plot further."""
    by_row: dict[str, list] = {}
    for p in plots:
        by_row.setdefault(p["row"], []).append(p)
    for row in by_row.values():
        row.sort(key=lambda p: p["x"])
        for i, p in enumerate(row):
            p["shade"] = []
            hp = HOUSE_TYPES[p["type"]]["height"]
            for j, q in enumerate(row):
                gap = abs(q["x"] - p["x"]) - (q["w"] + p["w"]) / 2
                if j != i and HOUSE_TYPES[q["type"]]["height"] - hp >= 3 and gap <= 8:
                    p["shade"].append({"loss": 0.20 if gap < 1 else 0.10, "side": "west" if q["x"] < p["x"] else "east"})


def kulai_daily() -> dict:
    """Daily yield on a 10° south roof from the hourly data, and the P90 wettest week, for the planner."""
    from .kulai_orientation import annual_yield, weather  # noqa
    import pvlib
    df = weather()
    sp = pvlib.solarposition.get_solarposition(df.index, KULAI["lat"], KULAI["lon"], KULAI["altitude_m"])
    dni_extra = pvlib.irradiance.get_extra_radiation(df.index)
    am = pvlib.atmosphere.get_relative_airmass(sp["apparent_zenith"])
    poa = pvlib.irradiance.get_total_irradiance(10, 180, sp["apparent_zenith"], sp["azimuth"], df["dni"], df["ghi"], df["dhi"],
                                                dni_extra=dni_extra, airmass=am, model="perez")["poa_global"].fillna(0)
    local = poa.tz_convert("Asia/Kuala_Lumpur")
    daily = (local.groupby(local.index.date).sum() / 1000 * 0.86 * 0.96 * 0.9).to_numpy()  # losses, inverter, temperature
    years = np.array([d.year for d in sorted(set(local.index.date))])
    worst = [np.convolve(daily[years == y], np.ones(7) / 7, "valid").min() for y in sorted(set(years)) if (years == y).sum() > 300]
    return {"p90_kwh_kwp_day": round(float(np.percentile(worst, 10)), 3), "typical_kwh_kwp_day": round(float(daily.mean()), 3),
            "specific_yield": round(float(daily.mean() * 365.25), 1), "years": len(worst)}


def run():
    rng = random.Random(SEED)
    plots = build_plots(rng)
    shading(plots)
    for c in COMMUNITY:
        c["flood_zone"] = c["y"] - c["d"] / 2 < FLOOD_Y
    data = {
        "sample": True,
        "note": "Sample layout for illustration. Replace with SDP's Kulai masterplan (CAD/GIS export).",
        "site": {**KULAI, "w": SITE_W, "h": SITE_H, "flood_y": FLOOD_Y, "acres": 557, "first_phase": 2028},
        "house_types": HOUSE_TYPES, "roof_forms": ROOF_FORMS, "phases": [{k: v for k, v in p.items() if k != "blocks"} for p in PHASES],
        "community": COMMUNITY, "kwp_per_m2": 0.2, "retrofit_rm_per_home": 3500, "grid_t_co2_per_mwh": 0.740,
        "plots": [{k: v for k, v in p.items() if k != "row"} for p in plots],
        "daily": kulai_daily(),
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    from collections import Counter
    print(f"Kulai sample layout: {len(plots)} plots {dict(Counter(p['type'] for p in plots))}; "
          f"shaded {sum(bool(p['shade']) for p in plots)}; planner yield {data['daily']['specific_yield']} kWh/kWp, "
          f"P90 wettest week {data['daily']['p90_kwh_kwp_day']}")


if __name__ == "__main__":
    run()
