"""Generate individual roofs per zone from zones.json (SAMPLE data, fixed seed).

score = 40% yield + 20% shading + 20% roof condition + 20% likelihood to sign.
Yield comes from the pvlib simulation; shading and condition are synthetic; likelihood
to sign is rule-based on synthetic owner attributes. Each zone's roofs are calibrated so
their mean score matches the hand-set zone score in zones.json.
"""
import json
import string

import numpy as np

from .config import DATA, SEED, WEB_DATA

WEIGHTS = {"yield": 0.4, "shading": 0.2, "condition": 0.2, "likelihood": 0.2}
TYPE_LABEL = {"f": "Ready-built factory", "m": "Medium industrial lot", "c": "Commercial", "h": "Terrace home", "a": "Apartment block"}
OWNER_TYPES = {
    "f": [("Owner-occupier", 0.55), ("Investor landlord", 0.35), ("Multinational tenant", 0.10)],
    "m": [("Owner-occupier", 0.65), ("Investor landlord", 0.25), ("Multinational tenant", 0.10)],
    "c": [("SDP-owned", 0.6), ("REIT", 0.4)],
    "h": [("Owner-occupier", 0.8), ("Landlord", 0.2)],
    "a": [("Management body", 1.0)],
}
LIKELIHOOD_BASE = {"Owner-occupier": 68, "Investor landlord": 48, "Multinational tenant": 58,
                   "SDP-owned": 85, "REIT": 60, "Landlord": 42, "Management body": 40}


def yield_score(specific_yield: float, site_yield: float) -> float:
    # 100 = site best case (no shading, ideal tilt); 0 = 25% below it
    return float(np.clip((specific_yield / site_yield - 0.75) / 0.25 * 100, 0, 100))


def likelihood(owner: str, condition: float, years_left: int, attended: bool) -> tuple[float, list[str]]:
    """Rule-based likelihood to sign, with reasons."""
    s, why = LIKELIHOOD_BASE[owner], [owner.lower()]
    if years_left >= 15:
        s += 10; why.append(f"{years_left} yrs on lease/title")
    elif years_left < 8:
        s -= 15; why.append(f"only {years_left} yrs left on lease")
    if condition < 50:
        s -= 10; why.append("roof needs repair first")
    if attended:
        s += 12; why.append("attended SDP solar briefing")
    return float(np.clip(s, 0, 100)), why


def make_roofs(zone: dict, defaults: dict, site_yield: float, rng: np.random.Generator) -> list[dict]:
    t = zone["type"]
    d = defaults[t]
    n = zone["rows"] * zone["cols"]
    owners, probs = zip(*OWNER_TYPES[t])
    roofs = []
    for i in range(n):
        r, c = divmod(i, zone["cols"])
        area = d["roof_m2"] * rng.uniform(0.8, 1.25)
        kwp = area * d["kwp"] / d["roof_m2"] * rng.uniform(0.88, 1.0)
        shading = float(np.clip(rng.normal(80, 12), 20, 100))
        orient_loss = rng.uniform(0.0, 0.06)
        spec = site_yield * (1 - orient_loss) * (0.82 + 0.18 * shading / 100)
        condition = float(np.clip(rng.normal(72, 15), 15, 100))
        owner = str(rng.choice(owners, p=probs))
        years_left = int(rng.integers(4, 30))
        attended = bool(rng.random() < 0.25)
        roofs.append(dict(r=r, c=c, area=area, kwp=kwp, spec=spec, shading=shading, condition=condition,
                          owner=owner, years_left=years_left, attended=attended, age=int(rng.integers(1, 25))))

    def score_all(shift: float):
        out = []
        for x in roofs:
            sh = float(np.clip(x["shading"] + shift, 0, 100))
            co = float(np.clip(x["condition"] + shift, 0, 100))
            spec = site_yield * (1 - (x["spec_loss"])) * (0.82 + 0.18 * sh / 100)
            lk, why = likelihood(x["owner"], co, x["years_left"], x["attended"])
            parts = {"yield": yield_score(spec, site_yield), "shading": sh, "condition": co, "likelihood": lk}
            out.append((parts, spec, why))
        return out

    for x in roofs:
        x["spec_loss"] = 1 - x["spec"] / (site_yield * (0.82 + 0.18 * x["shading"] / 100))

    # calibrate: bisection on a shared shift to shading/condition so mean score hits the zone score
    lo, hi = -80.0, 80.0
    for _ in range(40):
        mid = (lo + hi) / 2
        mean = np.mean([sum(WEIGHTS[k] * p[k] for k in WEIGHTS) for p, _, _ in score_all(mid)])
        lo, hi = (mid, hi) if mean < zone["score"] else (lo, mid)
    scored = score_all((lo + hi) / 2)

    rows = string.ascii_uppercase
    out = []
    for x, (parts, spec, why) in zip(roofs, scored):
        score = sum(WEIGHTS[k] * parts[k] for k in WEIGHTS)
        mwh = x["kwp"] * spec / 1000
        out.append({
            "id": f"{zone['id'].split(' ')[0].split(',')[0]}-{rows[x['r']]}{x['c'] + 1:02d}",
            "row": x["r"], "col": x["c"],
            "score": round(score), "parts": {k: round(v) for k, v in parts.items()},
            "area_m2": round(x["area"]), "kwp": round(x["kwp"], 1),
            "yield_kwh_kwp": round(spec), "mwh_yr": round(mwh, 2),
            "owner": x["owner"], "roof_age_yrs": x["age"], "lease_years_left": x["years_left"],
            "why": why,
        })
    return out


def summarise(zone: dict, roofs: list[dict]) -> dict:
    scores = [r["score"] for r in roofs]
    return {
        "n_roofs": len(roofs),
        "avg_score": round(float(np.mean(scores)), 1),
        "good_roofs": sum(s >= 75 for s in scores),
        "total_kwp": round(sum(r["kwp"] for r in roofs), 1),
        "mwh_yr": round(sum(r["mwh_yr"] for r in roofs), 1),
        "avg_mwh_per_roof": round(float(np.mean([r["mwh_yr"] for r in roofs])), 2),
    }


def run():
    zones_src = json.loads((DATA / "zones.json").read_text())
    site_yield = json.loads((WEB_DATA / "yield.json").read_text())["annual_kwh_per_kwp"]
    rng = np.random.default_rng(SEED)
    out = {"sample": True,
           "_note": "SAMPLE DATA. Roofs generated from zones.json with a fixed seed. Yield is from the pvlib simulation; shading, roof condition and owner attributes are synthetic; likelihood to sign is rule-based.",
           "weights": WEIGHTS, "site_yield_kwh_kwp": site_yield, "type_label": TYPE_LABEL, "sites": {}}
    for site in ("business_park", "homes"):
        src = zones_src[site]
        zones = []
        for z in src["zones"]:
            roofs = make_roofs(z, zones_src["roof_defaults"], site_yield, rng)
            zones.append({**{k: z[k] for k in ("id", "type", "rows", "cols", "x1", "y1", "x2", "y2")},
                          "target_score": z["score"], "summary": summarise(z, roofs), "roofs": roofs})
        out["sites"][site] = {"image": src["image"], "frame": src["frame"], "zones": zones}
        print(site, [(z["id"], z["target_score"], z["summary"]["avg_score"], z["summary"]["good_roofs"]) for z in zones])
    (WEB_DATA / "roofs.json").write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    return out


if __name__ == "__main__":
    run()
    print(f"{(WEB_DATA / 'roofs.json').stat().st_size / 1024:.0f} KB")
