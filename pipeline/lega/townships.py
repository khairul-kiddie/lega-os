"""Scan SDP townships: real building footprints -> solar-ready roofs -> per-township JSON.

Detect:   Microsoft Global ML Building Footprints (Malaysia, ODbL), cached in data/raw/footprints/.
Size:     roof area from the footprint polygon; usable panel area by roof class.
Classify: size/shape heuristic (house, terrace row, medium building, large flat roof).
Simulate: pvlib PVWatts on each township's own NASA POWER cell (real).
Score:    same 40/20/20/20 formula as roofs.py. Shading, roof condition and owner attributes
          are SAMPLE (synthetic, fixed seed): the footprint data has no heights.

Output: web/public/data/townships/index.json and one <id>.json per township, columnar to keep
files small (loaded only when a township is opened).
"""
import csv
import gzip
import hashlib
import io
import json
import math

import numpy as np
import requests

from .config import RAW, WEB_DATA
from .roofs import LIKELIHOOD_BASE, WEIGHTS, headline, likelihood, yield_score
from .simulate import annual_yield

FOOTPRINTS = RAW / "footprints"
OUT = WEB_DATA / "townships"
M_PER_DEG_LAT = 110_574

# Extents: OpenStreetMap (Nominatim) boundaries where the township is mapped as an area,
# otherwise a ~2.4 km box around the geocoded centre ("approx").
TOWNSHIPS = [
    {"id": "elmina", "name": "City of Elmina", "state": "Selangor", "bbox": [3.1603, 3.2135, 101.4925, 101.5289], "extent": "osm", "tile": "132232022"},
    {"id": "elmina-bp", "name": "Elmina Business Park", "state": "Selangor", "bbox": [3.2212, 3.2490, 101.5081, 101.5284], "extent": "osm", "tile": "132232022",
     "master_plan": "elmina-business-park.jpg"},
    {"id": "bukit-raja", "name": "Bandar Bukit Raja", "state": "Selangor", "bbox": [3.0760, 3.1116, 101.4121, 101.4687], "extent": "osm", "tile": "132232022"},
    {"id": "serenia", "name": "Serenia City", "state": "Selangor", "bbox": [2.8415, 2.8615, 101.6946, 101.7117], "extent": "osm", "tile": "132232022"},
    {"id": "ara-damansara", "name": "Ara Damansara", "state": "Selangor", "bbox": [3.0970, 3.1190, 101.5760, 101.5980], "extent": "approx", "tile": "132232022"},
    {"id": "putra-heights", "name": "Putra Heights", "state": "Selangor", "bbox": [2.9850, 3.0070, 101.5640, 101.5860], "extent": "approx", "tile": "132232022"},
    {"id": "nilai-impian", "name": "Nilai Impian", "state": "Negeri Sembilan", "bbox": [2.8310, 2.8530, 101.7970, 101.8190], "extent": "approx", "tile": "132232022"},
    {"id": "ainsdale", "name": "Bandar Ainsdale", "state": "Negeri Sembilan", "bbox": [2.7201, 2.7410, 101.8825, 101.8987], "extent": "osm", "tile": "132232200"},
    {"id": "pagoh", "name": "Bandar Universiti Pagoh", "state": "Johor", "bbox": [2.1330, 2.1725, 102.7144, 102.7454], "extent": "osm", "tile": "132232210"},
]

# usable panel share of the roof footprint and kWp per m² of panel area
USABLE = {"house": 0.45, "terrace": 0.45, "medium": 0.55, "large": 0.65}
M2_PER_KWP = 6.5
MIN_KWP = 3.0  # below this a roof isn't worth a lease
CLASS_LABEL = {"house": "House", "terrace": "Terrace row", "medium": "Shophouse / mid-size", "large": "Factory / large flat roof"}
OWNERS = {
    "house": [("Owner-occupier", 0.8), ("Landlord", 0.2)],
    "terrace": [("Owner-occupier", 0.8), ("Landlord", 0.2)],
    "medium": [("Owner-occupier", 0.5), ("Investor landlord", 0.5)],
    "large": [("Owner-occupier", 0.55), ("Investor landlord", 0.35), ("Multinational tenant", 0.10)],
}
assert all(o in LIKELIHOOD_BASE for v in OWNERS.values() for o, _ in v)


LINKS = "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv"


def ensure_tile(quadkey: str):
    """Download one Malaysia footprint tile (zoom-9 quadkey) if it isn't cached. Tiles are large and git-ignored."""
    path = FOOTPRINTS / f"{quadkey}.csv.gz"
    if path.exists():
        return path
    FOOTPRINTS.mkdir(parents=True, exist_ok=True)
    rows = csv.DictReader(io.StringIO(requests.get(LINKS, timeout=60).text))
    url = next(r["Url"] for r in rows if r["Location"] == "Malaysia" and r["QuadKey"] == quadkey)
    r = requests.get(url, timeout=600)
    r.raise_for_status()
    path.write_bytes(r.content)
    return path


def to_xy(ring, lat0):
    kx = M_PER_DEG_LAT * math.cos(math.radians(lat0))
    return [((lon) * kx, lat * M_PER_DEG_LAT) for lon, lat in ring]


def area_m2(xy) -> float:
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(xy, xy[1:]))) / 2


def min_rect(xy) -> tuple[float, float]:
    """Sides of the minimum-area bounding rectangle (rotating calipers over edge angles)."""
    best = None
    for (x1, y1), (x2, y2) in zip(xy, xy[1:]):
        a = math.atan2(y2 - y1, x2 - x1)
        c, s = math.cos(a), math.sin(a)
        us = [x * c + y * s for x, y in xy]
        vs = [-x * s + y * c for x, y in xy]
        w, h = max(us) - min(us), max(vs) - min(vs)
        if best is None or w * h < best[0] * best[1]:
            best = (w, h)
    return best or (0.0, 0.0)


def rdp(pts, eps):
    """Douglas-Peucker simplification (planar coords)."""
    if len(pts) < 4:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    d = [abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm for x, y in pts[1:-1]]
    i = int(np.argmax(d)) + 1
    if d[i - 1] > eps:
        return rdp(pts[: i + 1], eps)[:-1] + rdp(pts[i:], eps)
    return [pts[0], pts[-1]]


def simplify_ring(xy, eps):
    """Simplify a closed ring: split at the vertex farthest from the first, simplify both halves.
    Returns an open ring (no repeated closing point) with at least 3 vertices."""
    ring = xy[:-1] if xy[0] == xy[-1] else xy
    if len(ring) <= 4:
        return ring
    x0, y0 = ring[0]
    k = max(range(len(ring)), key=lambda i: (ring[i][0] - x0) ** 2 + (ring[i][1] - y0) ** 2)
    out = rdp(ring[: k + 1], eps)[:-1] + rdp(ring[k:] + [ring[0]], eps)[:-1]
    return out if len(out) >= 3 else ring


def classify(area: float, w: float, h: float) -> str:
    long, short = max(w, h), max(min(w, h), 0.1)
    if area < 300:
        return "house"
    if area < 2500 and long / short >= 3:
        return "terrace"
    if area < 1500:
        return "medium"
    return "large"


def rng_for(rid: str) -> np.random.Generator:
    return np.random.default_rng(int(hashlib.sha1(rid.encode()).hexdigest()[:8], 16))


def scan(t: dict) -> dict:
    s, n, w, e = t["bbox"]
    lat0 = (s + n) / 2
    site_yield = annual_yield(lat0, (w + e) / 2)
    feats = []
    with gzip.open(ensure_tile(t["tile"]), "rt") as fh:
        for line in fh:
            f = json.loads(line)
            ring = f["geometry"]["coordinates"][0]
            lon, lat = ring[0]
            if s <= lat <= n and w <= lon <= e:
                feats.append(ring)

    ox, oy = w, s  # local origin for compact integer coords (decimetres)
    kx = M_PER_DEG_LAT * math.cos(math.radians(lat0))
    cols = {k: [] for k in ("id", "cls", "poly", "area", "kwp", "mwh", "score", "parts", "units", "spec", "shade", "age", "lease", "owner", "headline", "why", "cx", "cy")}
    n_all = 0
    for i, ring in enumerate(sorted(feats, key=lambda r: (round(r[0][1], 4), r[0][0]))):
        xy = to_xy(ring, lat0)
        a = area_m2(xy)
        n_all += 1
        rw, rh = min_rect(xy)
        cls = classify(a, rw, rh)
        usable = a * USABLE[cls]
        kwp = usable / M2_PER_KWP
        if kwp < MIN_KWP:
            continue
        rid = f"{t['id']}-{i:05d}"
        r = rng_for(rid)
        owners, probs = zip(*OWNERS[cls])
        shading = float(np.clip(r.normal(82, 12), 25, 100))          # SAMPLE
        orient_loss = 0.0 if cls == "large" else r.uniform(0, 0.06)   # flat vs pitched, SAMPLE
        condition = float(np.clip(r.normal(72, 15), 15, 100))         # SAMPLE
        owner = str(r.choice(owners, p=probs))
        years_left, attended, age = int(r.integers(4, 30)), bool(r.random() < 0.25), int(r.integers(1, 25))
        spec = site_yield * (1 - orient_loss) * (0.82 + 0.18 * shading / 100)
        lk, why = likelihood(owner, condition, years_left, attended)
        parts = {"yield": yield_score(spec, site_yield), "shading": shading, "condition": condition, "likelihood": lk}
        score = round(sum(WEIGHTS[k] * parts[k] for k in WEIGHTS))
        shade_loss = 18 * (1 - shading / 100)
        simple = simplify_ring(xy, 0.6)
        poly = [round(v) for x, y in simple for v in ((x - ox * kx) * 10, (y - oy * M_PER_DEG_LAT) * 10)]
        cx = sum(p[0] for p in ring[:-1]) / (len(ring) - 1)
        cy = sum(p[1] for p in ring[:-1]) / (len(ring) - 1)
        for k, v in (("id", rid), ("cls", cls), ("poly", poly), ("area", round(a)), ("kwp", round(kwp, 1)), ("mwh", round(kwp * spec / 1000, 2)),
                     ("score", score), ("parts", [round(parts[k]) for k in WEIGHTS]), ("units", max(1, round(a / 110)) if cls == "terrace" else 1),
                     ("spec", round(spec)), ("shade", round(shade_loss, 1)), ("age", age), ("lease", years_left), ("owner", owner),
                     ("headline", headline(parts, shade_loss, age, owner, attended, years_left)), ("why", why),
                     ("cx", round(cx, 6)), ("cy", round(cy, 6))):
            cols[k].append(v)

    scores = np.array(cols["score"])
    mwh = np.array(cols["mwh"])
    good = scores >= 75
    by_cls = {c: int(sum(1 for x in cols["cls"] if x == c)) for c in CLASS_LABEL}
    summary = {
        "buildings_detected": n_all, "solar_ready": len(cols["id"]), "good_roofs": int(good.sum()),
        "avg_mwh_good": round(float(mwh[good].mean()), 2) if good.any() else 0,
        "mwh_yr": round(float(mwh.sum()), 1), "kwp": round(float(sum(cols["kwp"])), 1),
        "avg_score": round(float(scores.mean()), 1) if len(scores) else 0, "by_class": by_cls,
        "yield_kwh_kwp": round(site_yield, 1),
        "owners_for_1gwh": int(np.searchsorted(np.cumsum(mwh[np.argsort(-scores)]), 1000) + 1) if mwh.sum() >= 1000 else None,
    }
    meta = {k: t.get(k) for k in ("id", "name", "state", "bbox", "extent", "master_plan")}
    data = {**meta, "sample": True, "origin": [ox, oy], "kx": kx, "ky": M_PER_DEG_LAT, "weights": list(WEIGHTS), "class_label": CLASS_LABEL, **cols}
    return {"meta": {**meta, "summary": summary}, "data": data}


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for t in TOWNSHIPS:
        res = scan(t)
        (OUT / f"{t['id']}.json").write_text(json.dumps(res["data"], separators=(",", ":"), ensure_ascii=False))
        index.append(res["meta"])
        sm = res["meta"]["summary"]
        print(f"{t['name']:26} detected {sm['buildings_detected']:5}  solar-ready {sm['solar_ready']:5}  good {sm['good_roofs']:5}  "
              f"{sm['mwh_yr'] / 1000:6.1f} GWh/yr  yield {sm['yield_kwh_kwp']}  {(OUT / (t['id'] + '.json')).stat().st_size // 1024} KB")
    (OUT / "index.json").write_text(json.dumps({
        "sample": True,
        "_note": "Footprints: Microsoft Global ML Building Footprints (ODbL). Yield: pvlib on NASA POWER per township. Shading, condition and owner attributes are SAMPLE data.",
        "source": "Microsoft Global ML Building Footprints (Malaysia, 2026-02 release), ODbL",
        "min_kwp": MIN_KWP, "townships": index}, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    run()
