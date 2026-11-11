"""Community energy plan: power every school, place of worship, hall and clinic, and keep every
street lamp lit, from the township's own roofs, before any power is sold to businesses.

Facilities: real OpenStreetMap amenities inside the township outline (schools, kindergartens,
            mosques and surau, temples, community halls, clinics, libraries, police and fire stations).
Lamps:      OpenStreetMap barely maps street lamps in Malaysia, so lamps are ESTIMATED from the real
            road network inside the outline: one LED lamp every 30-40 m depending on road class.
            Parks get lamps by area.
Loads:      typical annual use per facility type (PLACEHOLDER until SDP has TNB bills or meters).
Roofs:      a facility first uses roofs inside its own grounds; any gap is filled by the nearest good
            roofs (score 75+). Each lamp group is fed by the nearest good roofs and a battery.
Never dark: each lamp group's battery is sized so that, replayed over 11 years of real daily weather
            (NASA POWER 2015-2025, pvlib), no night would have gone dark.

Output: web/public/data/community/index.json and one <id>.json per township.
"""
import json
import math
import time

import numpy as np
import requests

from . import nasa_power
from .config import RAW, WEB_DATA
from .simulate import hourly_from_daily
from .townships import OUT as TOWNSHIP_OUT, TOWNSHIPS, UA, in_outline, in_ring, outline, outline_bbox

CACHE = RAW / "community"
OUT = WEB_DATA / "community"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter"]
GOOD = 75

# Energy Commission of Malaysia, provisional grid emission factor 2024, Peninsular Malaysia
# ("Grid Emission Factor (GEF) in Malaysia 2022-2024 (provisional)", Feb 2026): 0.740 tCO2/MWh.
GRID_T_CO2_PER_MWH = 0.740

# Typical annual electricity use and share used while the sun is up. PLACEHOLDER figures.
# day = share of the load in daylight; the rest goes through a battery.
FACILITY = {
    "university":  {"label": "University / college", "group": "Schools", "mwh": 2000, "day": 0.80},
    "school":      {"label": "School", "group": "Schools", "mwh": 150, "day": 0.90},
    "rel_school":  {"label": "Religious school", "group": "Schools", "mwh": 70, "day": 0.85},
    "kindergarten": {"label": "Kindergarten", "group": "Schools", "mwh": 12, "day": 0.95},
    "learning":    {"label": "Learning centre", "group": "Schools", "mwh": 8, "day": 0.60},
    "masjid":      {"label": "Masjid", "group": "Places of worship", "mwh": 100, "day": 0.55},
    "surau":       {"label": "Surau", "group": "Places of worship", "mwh": 18, "day": 0.50},
    "worship":     {"label": "Temple / church", "group": "Places of worship", "mwh": 20, "day": 0.55},
    "hall":        {"label": "Community hall", "group": "Community halls", "mwh": 25, "day": 0.45},
    "clinic":      {"label": "Clinic", "group": "Health", "mwh": 30, "day": 0.85},
    "hospital":    {"label": "Hospital", "group": "Health", "mwh": 2500, "day": 0.60},
    "civic":       {"label": "Public service", "group": "Public services", "mwh": 60, "day": 0.65},
}
GROUPS = ["Schools", "Places of worship", "Community halls", "Health", "Public services"]

# Street lighting (ESTIMATED from road length): spacing in metres, LED watts.
LAMP_ROADS = {
    "primary": (30, 150), "secondary": (30, 120), "tertiary": (35, 90),
    "primary_link": (30, 120), "secondary_link": (30, 120), "tertiary_link": (35, 90),
    "residential": (40, 60), "unclassified": (40, 60), "living_street": (40, 40),
}
PARK_M2_PER_LAMP, PARK_LAMP_W, PARK_MAX_LAMPS = 800, 40, 150
LAMP_HOURS = 12          # 7 pm to 7 am
GROUP_CELL_M = 700       # lamps are grouped into ~700 m cells, one battery per group
BATT_EFF = 0.90          # round trip
BATT_DOD = 0.90          # usable share of nominal capacity
RESERVE = 0.20           # never plan to drain below 20%: headroom to dim lamps if a forecast turns bad
LAMP_PV_OVERSIZE = 1.4   # solar sized to 1.4x the average nightly need
NEIGHBOUR_M = 500        # a facility borrows good roofs within this distance
M_PER_DEG_LAT = 110_574


# ---------------------------------------------------------------- data
def overpass(t: dict, polys) -> dict:
    """Amenities, parks and roads for the outline's bounding box. Cached (slimmed) so reruns are offline."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{t['id']}.json"
    if path.exists():
        return json.loads(path.read_text())
    s, n, w, e = outline_bbox(polys)
    bb = f"{s},{w},{n},{e}"
    roads = "|".join(LAMP_ROADS)
    q = f"""[out:json][timeout:180];
(
 nwr["amenity"~"^(school|kindergarten|college|university|place_of_worship|community_centre|clinic|hospital|doctors|townhall|library|police|fire_station)$"]({bb});
 nwr["leisure"="park"]({bb});
 node["highway"="street_lamp"]({bb});
 way["highway"~"^({roads})$"]({bb});
);
out tags geom;"""
    last, r = None, None
    for attempt in range(4):  # public Overpass servers are often busy: retry with backoff
        for url in OVERPASS:
            try:
                r = requests.post(url, data={"data": q}, headers=UA, timeout=240)
                if r.ok:
                    break
                last = f"{url}: HTTP {r.status_code}"
            except requests.RequestException as ex:
                last = f"{url}: {ex}"
            r = None
            time.sleep(2)
        if r is not None:
            break
        time.sleep(30 * (attempt + 1))
    if r is None:
        raise RuntimeError(f"Overpass unavailable ({last})")
    keep = ("amenity", "leisure", "highway", "name", "religion", "name:en")
    els = []
    for el in r.json()["elements"]:
        tags = {k: v for k, v in el.get("tags", {}).items() if k in keep}
        g = el.get("geometry")
        if el["type"] == "node":
            geom = [[round(el["lon"], 6), round(el["lat"], 6)]]
        elif el["type"] == "way" and g:
            geom = [[round(p["lon"], 6), round(p["lat"], 6)] for p in g]
        elif el["type"] == "relation":  # multipolygon: keep the outer ways' points as one ring
            geom = [[round(p["lon"], 6), round(p["lat"], 6)] for m in el.get("members", []) if m.get("role") == "outer"
                    for p in m.get("geometry", [])]
        else:
            continue
        if geom:
            els.append({"type": el["type"], "id": el["id"], "tags": tags, "geom": geom})
    data = {"source": "OpenStreetMap via Overpass API (ODbL)", "fetched": time.strftime("%Y-%m-%d"), "elements": els}
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    time.sleep(2)
    return data


def daily_yield(lat: float, lon: float) -> tuple[list[str], np.ndarray]:
    """Daily kWh per kWp, 2015-2025, on this township's own NASA POWER cell."""
    daily = nasa_power.load(lat, lon)
    h = hourly_from_daily(daily, {"lat": lat, "lon": lon})
    d = h["ac_w"].groupby(h.index.tz_localize(None).normalize()).sum() / 1000
    d = d.reindex(daily.index).fillna(d.mean())
    return [x.strftime("%Y-%m-%d") for x in d.index], d.to_numpy()


# ---------------------------------------------------------------- facilities
def facility_type(tags: dict) -> str | None:
    a, name = tags.get("amenity"), (tags.get("name") or "").lower()
    if a in ("college", "university"):
        return "university"
    if a == "school":
        if "tuition" in name or "tuisyen" in name:
            return "learning"
        if any(k in name for k in ("agama", "tahfiz", "maahad", "sra ", "islam")):
            return "rel_school"
        return "school"
    if a == "kindergarten":
        return "kindergarten"
    if a == "place_of_worship":
        if name.startswith("masjid") or "mosque" in name:
            return "masjid"
        if name.startswith("surau") or tags.get("religion") == "muslim":
            return "surau"
        return "worship"
    if a == "community_centre":
        return "hall"
    if a in ("clinic", "doctors"):
        return "clinic"
    if a == "hospital":
        return "hospital"
    if a in ("townhall", "library", "police", "fire_station"):
        return "civic"
    return None


def centroid(geom):
    xs, ys = [p[0] for p in geom], [p[1] for p in geom]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def metres(kx):
    return lambda a, b: math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * M_PER_DEG_LAT)


def facilities(els, polys, kx):
    dist = metres(kx)
    out = []
    for el in els:
        ft = facility_type(el["tags"])
        if not ft:
            continue
        c = centroid(el["geom"])
        if not in_outline(*c, polys):
            continue
        area = el["type"] != "node" and len(el["geom"]) >= 4
        out.append({"osm": f"{el['type'][0]}{el['id']}", "type": ft, "name": el["tags"].get("name") or "",
                    "c": c, "ring": el["geom"] if area else None})
    # the same place is often mapped twice (a point and an area): keep the area
    out.sort(key=lambda f: f["ring"] is None)
    kept = []
    for f in out:
        dup = any(k["type"] == f["type"] and (dist(k["c"], f["c"]) < 120 and (not f["name"] or not k["name"] or k["name"] == f["name"])
                                               or (k["ring"] and f["ring"] is None and in_ring(*f["c"], k["ring"])
                                                   and FACILITY[k["type"]]["group"] == FACILITY[f["type"]]["group"]))
                  for k in kept)
        if not dup:
            kept.append(f)
    return kept


# ---------------------------------------------------------------- lamps
def lamp_points(els, polys, kx):
    """Estimated lamp positions along roads (and in parks) inside the outline."""
    pts, road_m, mapped = [], {}, 0
    for el in els:
        tg = el["tags"]
        if el["type"] == "node" and tg.get("highway") == "street_lamp":
            mapped += in_outline(*el["geom"][0], polys)
            continue
        hw = tg.get("highway")
        if el["type"] == "way" and hw in LAMP_ROADS:
            spacing, watts = LAMP_ROADS[hw]
            carry = spacing / 2  # first lamp half a spacing in
            for a, b in zip(el["geom"], el["geom"][1:]):
                seg = math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * M_PER_DEG_LAT)
                mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                if seg == 0 or not in_outline(*mid, polys):
                    continue
                road_m[hw] = road_m.get(hw, 0) + seg
                d = carry
                while d <= seg:
                    k = d / seg
                    pts.append((a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, watts, "road"))
                    d += spacing
                carry = d - seg
        elif tg.get("leisure") == "park" and len(el["geom"]) >= 4:
            c = centroid(el["geom"])
            if not in_outline(*c, polys):
                continue
            xy = [(p[0] * kx, p[1] * M_PER_DEG_LAT) for p in el["geom"]]
            a = abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1]))) / 2
            for _ in range(min(PARK_MAX_LAMPS, max(1, round(a / PARK_M2_PER_LAMP)))):
                pts.append((c[0], c[1], PARK_LAMP_W, "park"))
    return pts, road_m, mapped


def size_battery(load_kwh: float, kwp: float, y: np.ndarray) -> dict:
    """Smallest usable battery (kWh) for which no night goes dark over the whole weather record,
    with solar charging by day (losses on the way in and out)."""
    eta = math.sqrt(BATT_EFF)
    gen = kwp * y * eta
    need = load_kwh / eta

    def replay(cap):
        soc, dark, low, low_i = cap, 0, cap, 0
        socs = np.empty(len(y))
        for i, g in enumerate(gen):
            soc = min(cap, soc + g) - need
            if soc < 0:
                dark += 1
                soc = 0.0
            if soc < low:
                low, low_i = soc, i
            socs[i] = soc
        return dark, low, low_i, socs

    lo, hi = 0.0, load_kwh * 30
    if replay(hi)[0]:
        return {"usable": None}
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if replay(mid)[0] == 0 else (mid, hi)
    cap = math.ceil(hi / (1 - RESERVE))  # keep a reserve above the bare minimum
    dark, low, low_i, socs = replay(cap)
    one_night = replay(load_kwh / eta)[0]  # what a one-night battery would have done
    return {"usable": cap, "nominal": math.ceil(cap / BATT_DOD), "dark": dark, "low_pct": round(100 * low / cap),
            "low_i": low_i, "one_night_dark": one_night, "socs": socs}


# ---------------------------------------------------------------- plan
def best_fit(cands: list[dict], need: float, size) -> list[dict]:
    """Pick roofs to cover `need`: each time the smallest roof that covers what's left,
    otherwise the biggest one and repeat. Few roofs, and no 30,000 m2 factory for a few lamps."""
    pool, out, left = list(cands), [], need
    while left > 1e-9 and pool:
        fits = [r for r in pool if size(r) >= left]
        r = min(fits, key=size) if fits else max(pool, key=size)
        out.append(r)
        pool.remove(r)
        left -= size(r)
    return out


def plan(t: dict) -> dict:
    polys = outline(t)
    s, n, w, e = outline_bbox(polys)
    lat0, lon0 = (s + n) / 2, (w + e) / 2
    kx = M_PER_DEG_LAT * math.cos(math.radians(lat0))
    dist = metres(kx)
    dates, y = daily_yield(lat0, lon0)
    annual = float(y.sum() / (len(y) / 365.25))
    months = np.array([int(d[5:7]) for d in dates])
    month_share = np.array([y[months == m].mean() for m in range(1, 13)]) / y.mean()  # 1 = average month
    worst_month = float(month_share.min())

    roofs = json.loads((TOWNSHIP_OUT / f"{t['id']}.json").read_text())
    R = [{"id": roofs["id"][i], "c": (roofs["cx"][i], roofs["cy"][i]), "mwh": roofs["mwh"][i], "kwp": roofs["kwp"][i],
          "score": roofs["score"][i], "cls": roofs["cls"][i], "name": roofs["name"][i]} for i in range(len(roofs["id"]))]
    taken: set[str] = set()

    osm = overpass(t, polys)
    els = osm["elements"]

    # 1. facilities: own roof first, then the nearest good neighbour roofs
    facs = []
    for f in sorted(facilities(els, polys, kx), key=lambda f: (GROUPS.index(FACILITY[f["type"]]["group"]), -FACILITY[f["type"]]["mwh"])):
        spec = FACILITY[f["type"]]
        # energy the roofs must make: daylight use direct, the rest through a battery
        need = spec["mwh"] * (spec["day"] + (1 - spec["day"]) / BATT_EFF)
        if f["ring"]:  # roofs in its own grounds, only as many as it needs (a campus keeps the rest for others)
            grounds = [r for r in R if r["id"] not in taken and in_ring(*r["c"], f["ring"])]
            own = best_fit(grounds, need / worst_month, lambda r: r["mwh"])
        else:
            near = sorted((r for r in R if r["id"] not in taken and dist(r["c"], f["c"]) < 30), key=lambda r: dist(r["c"], f["c"]))
            own = near[:1]
        own_mwh = sum(r["mwh"] for r in own)
        taken |= {r["id"] for r in own}
        shared, mwh = [], own_mwh
        if mwh * worst_month < need:
            near = [r for r in R if r["id"] not in taken and r["score"] >= GOOD and dist(r["c"], f["c"]) <= NEIGHBOUR_M]
            shared = best_fit(near, need / worst_month - mwh, lambda r: r["mwh"])
            mwh += sum(r["mwh"] for r in shared)
            taken |= {r["id"] for r in shared}
        cover = mwh * worst_month / need
        status = "self" if own and own_mwh * worst_month >= need else "shared" if cover >= 1 else "short"
        night_kwh = spec["mwh"] * 1000 * (1 - spec["day"]) / 365
        facs.append({
            "id": f["osm"], "name": f["name"] or spec["label"], "type": f["type"], "label": spec["label"], "group": spec["group"],
            "lat": round(f["c"][1], 6), "lon": round(f["c"][0], 6), "need_mwh": spec["mwh"], "day_share": spec["day"],
            "own_roofs": [r["id"] for r in own], "own_mwh": round(own_mwh, 1),
            "shared_roofs": [r["id"] for r in shared], "shared_mwh": round(mwh - own_mwh, 1),
            "kwp": round(sum(r["kwp"] for r in own + shared), 1),
            "battery_kwh": math.ceil(night_kwh * 1.2 / BATT_DOD) if night_kwh else 0,
            "cover_worst_month": round(min(cover, 9.99), 2), "status": status,
            # surplus the facility's own roof makes beyond its needs (weekends, school holidays)
            "surplus_mwh": round(max(0.0, own_mwh - need), 1),
        })

    # 2. street lamps: group, size solar + battery, feed from nearest remaining good roofs
    pts, road_m, mapped = lamp_points(els, polys, kx)
    cells: dict[tuple[int, int], list] = {}
    for p in pts:
        key = (int((p[0] - w) * kx // GROUP_CELL_M), int((p[1] - s) * M_PER_DEG_LAT // GROUP_CELL_M))
        cells.setdefault(key, []).append(p)
    lamps = []
    socs_all = []
    for gi, key in enumerate(sorted(cells, key=lambda k: (-k[1], k[0]))):
        ps = cells[key]
        c = (sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps))
        load = sum(p[2] for p in ps) * LAMP_HOURS / 1000  # kWh per night
        kwp_need = LAMP_PV_OVERSIZE * load / (y.mean() * BATT_EFF)
        free = [r for r in R if r["id"] not in taken and r["score"] >= GOOD]
        near = [r for r in free if dist(r["c"], c) <= NEIGHBOUR_M]
        if sum(r["kwp"] for r in near) < kwp_need:  # not enough close by: widen to the nearest roofs anywhere
            near = sorted(free, key=lambda r: dist(r["c"], c))[: len(near) + 20]
        fed = best_fit(near, kwp_need, lambda r: r["kwp"])
        kwp = sum(r["kwp"] for r in fed)
        taken |= {r["id"] for r in fed}
        b = size_battery(load, kwp, y) if kwp > 0 else {"usable": None}
        if b["usable"] is not None:
            socs_all.append(b.pop("socs") / b["usable"])
        lamps.append({
            "id": f"L{gi + 1:02d}", "lat": round(c[1], 6), "lon": round(c[0], 6), "lamps": len(ps),
            "park_lamps": sum(p[3] == "park" for p in ps), "night_kwh": round(load, 1),
            "kwp_need": round(kwp_need, 1), "kwp": round(kwp, 1), "roofs": [r["id"] for r in fed],
            "battery_kwh": b.get("nominal"), "battery_usable_kwh": b.get("usable"), "dark_nights": b.get("dark"),
            "lowest_pct": b.get("low_pct"), "lowest_date": dates[b["low_i"]] if b.get("usable") else None,
            "one_night_dark": b.get("one_night_dark"), "ok": bool(b.get("usable")) and kwp >= kwp_need * 0.999,
        })

    # wettest stretch for the story: the 7 days with the least sun in the record
    wk = np.convolve(y, np.ones(7), "valid")
    wi = int(wk.argmin())
    lowest_curve = None
    if socs_all:
        # all lamp batteries together, charge left each morning (share of usable capacity)
        caps = np.array([L["battery_usable_kwh"] for L in lamps if L["battery_usable_kwh"]], float)
        agg = (np.vstack(socs_all) * caps[:, None]).sum(axis=0) / caps.sum()
        li = int(agg.argmin())
        lo = max(0, li - 10)
        lowest_curve = {"dates": dates[lo: li + 11], "pct": [round(float(v) * 100) for v in agg[lo: li + 11]],
                        "lowest_date": dates[li], "lowest_pct": round(float(agg[li]) * 100),
                        "sun_kwh_kwp": [round(float(v), 2) for v in y[lo: li + 11]]}

    good_all = [r for r in R if r["score"] >= GOOD]
    reserved_good = [r for r in good_all if r["id"] in taken]
    fac_mwh = sum(min(f["need_mwh"], (f["own_mwh"] + f["shared_mwh"]) * 1.0) for f in facs)
    lamp_mwh = sum(L["night_kwh"] for L in lamps if L["ok"]) * 365 / 1000
    community_mwh = fac_mwh + lamp_mwh
    surplus_mwh = sum(r["mwh"] for r in good_all if r["id"] not in taken) + sum(f["surplus_mwh"] for f in facs)
    summary = {
        "facilities": len(facs),
        "self": sum(f["status"] == "self" for f in facs),
        "shared": sum(f["status"] == "shared" for f in facs),
        "short": sum(f["status"] == "short" for f in facs),
        "by_group": {g: sum(f["group"] == g for f in facs) for g in GROUPS},
        "lamps": sum(L["lamps"] for L in lamps), "lamps_mapped_osm": mapped,
        "lamp_groups": len(lamps), "lamp_groups_ok": sum(L["ok"] for L in lamps),
        "dark_nights": sum((L["dark_nights"] or 0) for L in lamps),
        "road_km": round(sum(road_m.values()) / 1000, 1),
        "lamp_mwh_yr": round(lamp_mwh, 1), "facility_mwh_yr": round(fac_mwh, 1),
        "community_mwh_yr": round(community_mwh, 1),
        "co2_t_yr": round(community_mwh * GRID_T_CO2_PER_MWH),
        "roofs_used": len(taken), "good_roofs_reserved": len(reserved_good), "good_roofs": len(good_all),
        "surplus_mwh_yr": round(surplus_mwh, 1),
        "surplus_co2_t_yr": round(surplus_mwh * GRID_T_CO2_PER_MWH),
        "battery_kwh": sum(L["battery_kwh"] or 0 for L in lamps) + sum(f["battery_kwh"] for f in facs),
        "yield_kwh_kwp": round(annual, 1), "worst_month_share": round(worst_month, 3),
        "wettest_week": {"start": dates[wi], "end": dates[wi + 6], "kwh_kwp": round(float(wk[wi]), 2),
                         "typical_kwh_kwp": round(float(y.mean() * 7), 2)},
        "record": {"start": dates[0], "end": dates[-1], "days": len(dates)},
    }
    left = [r["mwh"] for r in good_all if r["id"] not in taken]
    return {"id": t["id"], "name": t["name"], "summary": summary, "facilities": facs, "lamp_groups": lamps,
            "lowest_curve": lowest_curve, "_avg_mwh_surplus": round(sum(left) / len(left), 2) if left else 0}


def _np(o):
    """numpy scalars -> plain Python for json."""
    return o.item() if isinstance(o, np.generic) else o


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    index, reserved = [], {}
    for t in TOWNSHIPS:
        p = plan(t)
        sm = p["summary"]
        index.append({"id": t["id"], "name": t["name"], "summary": sm})
        reserved[t["id"]] = (sm["good_roofs_reserved"], p.pop("_avg_mwh_surplus"))
        (OUT / f"{t['id']}.json").write_text(json.dumps(p, separators=(",", ":"), ensure_ascii=False, default=_np))
        print(f"{t['name']:26} facilities {sm['facilities']:3} (self {sm['self']}, shared {sm['shared']}, short {sm['short']})  "
              f"lamps {sm['lamps']:5} in {sm['lamp_groups']:2} groups, ok {sm['lamp_groups_ok']}, dark nights {sm['dark_nights']}  "
              f"community {sm['community_mwh_yr']:7.0f} MWh  CO2 {sm['co2_t_yr']:5} t  surplus {sm['surplus_mwh_yr'] / 1000:5.1f} GWh")
    (OUT / "index.json").write_text(json.dumps({
        "sample": True,
        "grid_t_co2_per_mwh": GRID_T_CO2_PER_MWH,
        "co2_source": "Energy Commission of Malaysia, Grid Emission Factor 2022-2024 (provisional), Peninsular 2024",
        "facility_source": "OpenStreetMap amenities via Overpass API (ODbL)",
        "loads": {k: {"label": v["label"], "mwh": v["mwh"], "day": v["day"]} for k, v in FACILITY.items()},
        "lamp_roads": {k: {"spacing_m": s, "watts": wt} for k, (s, wt) in LAMP_ROADS.items()},
        "lamp_hours": LAMP_HOURS, "battery_eff": BATT_EFF, "battery_dod": BATT_DOD, "lamp_pv_oversize": LAMP_PV_OVERSIZE,
        "neighbour_m": NEIGHBOUR_M, "good_score": GOOD,
        "townships": index}, indent=1, ensure_ascii=False, default=_np))
    # community first: tell the business portfolio builder which good roofs are already taken
    tpath = TOWNSHIP_OUT / "index.json"
    tidx = json.loads(tpath.read_text())
    for m in tidx["townships"]:
        if m["id"] in reserved:
            m["summary"]["community_reserved"], m["summary"]["avg_mwh_surplus"] = reserved[m["id"]]
    tpath.write_text(json.dumps(tidx, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    run()
