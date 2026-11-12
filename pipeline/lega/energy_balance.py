"""Energy balance per township: how much electricity its rooftops could generate in a year, and an
estimate of how much the township uses.

Generation is computed: every solar-ready roof in the township scan (Overture footprints, pvlib on
NASA POWER weather for that township). Use is an ESTIMATE, because there are no bills in the data:
  homes          = dwellings x a SAMPLE 4,800 kWh a year (400 kWh a month, the same as the Kulai sample)
  businesses     = roof footprint x a SAMPLE intensity per m2 (one floor; commercial, industrial,
                   untyped mid-size and large buildings)
  community      = the community plan's schools, surau, halls and clinics (typical use per building)
  street lamps   = the community plan's standalone solar lamps (computed per road length)
Public-building roofs are left out of "businesses" so community facilities aren't counted twice.

Output: web/public/data/energy_balance.json
"""
import json

from .community import GRID_T_CO2_PER_MWH
from .config import WEB_DATA
from .townships import TOWNSHIPS, read_township

OUT = WEB_DATA / "energy_balance.json"
HOME_KWH_YR = 4_800                 # SAMPLE: 400 kWh a month per home
APARTMENT_FLOORS, APARTMENT_M2 = 5, 90  # SAMPLE: dwellings per apartment block = footprint x floors / flat size
BUSINESS_KWH_M2 = {"commercial": 200, "industrial": 150, "large": 100, "medium": 60, "parking": 5}  # SAMPLE, per m2 of roof
ROOF_GROUP = {"house": "homes", "terrace": "homes", "apartment": "homes", "commercial": "business", "industrial": "business",
              "large": "business", "medium": "business", "parking": "business", "public": "public"}


def dwellings(cls: str, units: int, area: float) -> int:
    if cls in ("house", "terrace"):
        return units
    if cls == "apartment":
        return max(1, round(area * APARTMENT_FLOORS / APARTMENT_M2))
    return 0


def balance(tid: str, community: dict) -> dict:
    d = read_township(tid)
    gen = {"homes": 0.0, "business": 0.0, "public": 0.0}
    homes, business_mwh = 0, 0.0
    for cls, units, area, mwh in zip(d["cls"], d["units"], d["area"], d["mwh"]):
        gen[ROOF_GROUP[cls]] += mwh
        homes += dwellings(cls, units, area)
        business_mwh += area * BUSINESS_KWH_M2.get(cls, 0) / 1000
    s = community["summary"]
    use = {"homes": homes * HOME_KWH_YR / 1000, "business": business_mwh,
           "community": s["facility_mwh_yr"], "lamps": s["lamp_mwh_yr"]}
    g, u = sum(gen.values()), sum(use.values())
    return {
        "generation_mwh": round(g, 1),
        "generation_by_roof": {k: round(v, 1) for k, v in gen.items()},
        "use_mwh": round(u, 1),
        "use": {k: round(v, 1) for k, v in use.items()},
        "cover": round(g / u, 3) if u else None,
        "homes": homes,
        "roofs": len(d["id"]),
        "facilities": s["facilities"],
        "lamps": s["lamps"],
        "yield_kwh_kwp": s["yield_kwh_kwp"],
        "co2_t_yr_if_all_used": round(min(g, u) * GRID_T_CO2_PER_MWH),
    }


def run():
    cidx = {t["id"]: t for t in json.loads((WEB_DATA / "community" / "index.json").read_text())["townships"]}
    tidx = {t["id"]: t for t in json.loads((WEB_DATA / "townships" / "index.json").read_text())["townships"]}
    rows = []
    for t in TOWNSHIPS:
        if t["id"] not in cidx:
            continue
        rows.append({"id": t["id"], "name": t["name"], "state": t["state"], "parent": tidx[t["id"]].get("parent"),
                     **balance(t["id"], cidx[t["id"]])})
    OUT.write_text(json.dumps({
        "sample": True,
        "note": "Generation is computed from real building footprints and real weather. Use is an estimate from sample rates until SDP has meter or TNB bill data.",
        "assumptions": {"home_kwh_yr": HOME_KWH_YR, "apartment_floors": APARTMENT_FLOORS, "apartment_m2": APARTMENT_M2,
                        "business_kwh_m2": BUSINESS_KWH_M2, "grid_t_co2_per_mwh": GRID_T_CO2_PER_MWH},
        "townships": rows,
    }, indent=1))
    tg, tu = sum(r["generation_mwh"] for r in rows), sum(r["use_mwh"] for r in rows)
    print(f"energy balance: {len(rows)} townships, rooftop solar {tg / 1000:.1f} GWh/yr vs estimated use {tu / 1000:.1f} GWh/yr ({tg / tu:.0%})")


if __name__ == "__main__":
    run()
