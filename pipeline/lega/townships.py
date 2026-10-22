"""Scan SDP townships: real building footprints -> solar-ready roofs -> per-township JSON.

Extent:   the township's OpenStreetMap outline (cached in data/raw/outlines/); a building counts
          if its centre lies inside. Townships without a mapped outline use an approximate box.
Detect:   Overture Maps buildings (conflated OpenStreetMap + Google Open Buildings + Microsoft ML
          footprints), pinned release, cached in data/raw/overture/.
Size:     roof area from the footprint polygon; usable panel area by roof class.
Classify: size/shape heuristic (house, terrace row, medium building, large flat roof).
Simulate: pvlib PVWatts on each township's own NASA POWER cell (real).
Score:    same 40/20/20/20 formula as roofs.py. Shading, roof condition and owner attributes
          are SAMPLE (synthetic, fixed seed): the footprint data has no heights.

Output: web/public/data/townships/index.json and one <id>.json per township, columnar to keep
files small (loaded only when a township is opened).
"""
import hashlib
import json
import math
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import requests

from .config import RAW, WEB_DATA
from .scoring import LIKELIHOOD_BASE, WEIGHTS, headline, likelihood, yield_score
from .simulate import annual_yield

OVERTURE = RAW / "overture"
OUTLINES = RAW / "outlines"
OVERTURE_RELEASE = "2026-10-21.0"
OUT = WEB_DATA / "townships"
SRC_CODE = {"OpenStreetMap": "o", "Google Open Buildings": "g", "Microsoft ML Buildings": "m"}
SRC_LABEL = {"o": "OpenStreetMap", "g": "Google Open Buildings", "m": "Microsoft ML Buildings", "x": "Other"}
M_PER_DEG_LAT = 110_574

# Township list and locations: confirm against SDP's official township list before relying on it.
# "parent" groups a site under a township on the Roof map (Elmina Business Park is part of City of Elmina);
# "site" names that site in the Business park | Homes toggle.
# Extents: OpenStreetMap (Nominatim) boundaries where the township is mapped as an area,
# otherwise a ~2.4 km box around the geocoded centre ("approx").
TOWNSHIPS = [
    {"id": "elmina", "name": "City of Elmina", "state": "Selangor", "osm": ["W866543395"], "site": "Homes"},
    {"id": "elmina-bp", "name": "Elmina Business Park", "state": "Selangor", "osm": ["R18576647", "R19844740"],
     "parent": "elmina", "site": "Business park"},
    {"id": "bukit-raja", "name": "Bandar Bukit Raja", "state": "Selangor", "osm": ["R19844690"]},
    {"id": "serenia", "name": "Serenia City", "state": "Selangor", "osm": ["R14186975"]},
    # no mapped outline in OSM (only a point): ~2.4 km box around the geocoded centre
    {"id": "ara-damansara", "name": "Ara Damansara", "state": "Selangor", "bbox": [3.0970, 3.1190, 101.5760, 101.5980]},
    {"id": "putra-heights", "name": "Putra Heights", "state": "Selangor", "osm": ["R11911049"]},
    {"id": "nilai-impian", "name": "Nilai Impian", "state": "Negeri Sembilan", "osm": ["W1079443925"]},
    {"id": "ainsdale", "name": "Bandar Ainsdale", "state": "Negeri Sembilan", "osm": ["R17831572"]},
    {"id": "pagoh", "name": "Bandar Universiti Pagoh", "state": "Johor", "osm": ["W865557126"]},
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


UA = {"User-Agent": "lega-os-prototype/1.0 (SDP hackathon; github.com/khairul-kiddie/lega-os)"}


def outline(t: dict) -> list[list[list[list[float]]]]:
    """Township outline as a list of polygons, each [outer ring, *holes] in [lon, lat].
    Fetched once from OpenStreetMap (Nominatim) and cached so reruns are offline."""
    if "osm" not in t:
        s, n, w, e = t["bbox"]
        return [[[[w, s], [e, s], [e, n], [w, n], [w, s]]]]
    OUTLINES.mkdir(parents=True, exist_ok=True)
    path = OUTLINES / f"{t['id']}.geojson"
    if not path.exists():
        r = requests.get("https://nominatim.openstreetmap.org/lookup", headers=UA, timeout=60,
                         params={"osm_ids": ",".join(t["osm"]), "format": "geojson", "polygon_geojson": 1})
        r.raise_for_status()
        path.write_text(r.text)
        time.sleep(1.1)  # Nominatim usage policy: max 1 request/s
    polys = []
    for f in json.loads(path.read_text())["features"]:
        g = f["geometry"]
        polys += [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
    assert polys, f"no polygon outline for {t['id']}"
    return polys


def in_ring(x: float, y: float, ring) -> bool:
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def in_outline(x: float, y: float, polys) -> bool:
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def outline_bbox(polys) -> list[float]:
    xs = [pt[0] for p in polys for pt in p[0]]
    ys = [pt[1] for p in polys for pt in p[0]]
    return [min(ys), max(ys), min(xs), max(xs)]


def buildings(t: dict, bbox: list[float]) -> Path:
    """Overture buildings for the outline's bounding box (pinned release), cached. Large: git-ignored."""
    path = OVERTURE / f"{t['id']}_{OVERTURE_RELEASE}.geojsonseq"
    if path.exists():
        return path
    OVERTURE.mkdir(parents=True, exist_ok=True)
    s, n, w, e = bbox
    cli = Path(sys.executable).with_name("overturemaps")
    subprocess.run([str(cli), "download", f"--bbox={w},{s},{e},{n}", "-f", "geojsonseq", "--type=building",
                    "-r", OVERTURE_RELEASE, "-o", str(path)], check=True)
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
    polys = outline(t)
    s, n, w, e = outline_bbox(polys)
    lat0 = (s + n) / 2
    site_yield = annual_yield(lat0, (w + e) / 2)
    feats, srcs = [], []
    with open(buildings(t, [s, n, w, e])) as fh:
        for line in fh:
            f = json.loads(line)
            g = f["geometry"]
            if g["type"] == "MultiPolygon":  # keep the largest part
                g = {"coordinates": max(g["coordinates"], key=lambda p: len(p[0]))}
            elif g["type"] != "Polygon":
                continue
            ring = g["coordinates"][0]
            if len(ring) < 4:
                continue
            cx = sum(p[0] for p in ring[:-1]) / (len(ring) - 1)
            cy = sum(p[1] for p in ring[:-1]) / (len(ring) - 1)
            if not in_outline(cx, cy, polys):
                continue
            feats.append(ring)
            srcs.append(SRC_CODE.get((f["properties"].get("sources") or [{}])[0].get("dataset"), "x"))

    ox, oy = w, s  # local origin for compact integer coords (decimetres)
    kx = M_PER_DEG_LAT * math.cos(math.radians(lat0))
    cols = {k: [] for k in ("id", "cls", "poly", "area", "kwp", "mwh", "score", "parts", "units", "spec", "shade", "age", "lease", "owner", "headline", "why", "cx", "cy", "src")}
    n_all = 0
    n_src = {}
    for i, (ring, src) in enumerate(sorted(zip(feats, srcs), key=lambda rs: (round(rs[0][0][1], 4), rs[0][0][0]))):
        xy = to_xy(ring, lat0)
        a = area_m2(xy)
        n_all += 1
        n_src[src] = n_src.get(src, 0) + 1
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
                     ("cx", round(cx, 6)), ("cy", round(cy, 6)), ("src", src)):
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
        "by_source": {SRC_LABEL[k]: v for k, v in sorted(n_src.items(), key=lambda kv: -kv[1])},
        "owners_for_1gwh": int(np.searchsorted(np.cumsum(mwh[np.argsort(-scores)]), 1000) + 1) if mwh.sum() >= 1000 else None,
    }
    # simplified outline for drawing: [[ [lat, lng], ... ], ...] outer rings only
    draw = []
    for p in polys:
        xy = [(x * 1e5, y * 1e5) for x, y in p[0]]
        draw.append([[round(y / 1e5, 5), round(x / 1e5, 5)] for x, y in simplify_ring(xy, 2.0)])
    meta = {"id": t["id"], "name": t["name"], "state": t["state"], "bbox": [s, n, w, e], "extent": "osm" if "osm" in t else "approx",
            "osm": t.get("osm"), "outline": draw, **{k: t.get(k) for k in ("parent", "site")}}
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
        "_note": "Footprints: Overture Maps buildings (ODbL), clipped to each township's OpenStreetMap outline. Yield: pvlib on NASA POWER per township. Shading, condition and owner attributes are SAMPLE data.",
        "source": f"Overture Maps buildings, release {OVERTURE_RELEASE} (OpenStreetMap, Google Open Buildings, Microsoft ML footprints; ODbL)",
        "list_note": "Township list and locations are approximate (OpenStreetMap); confirm against SDP's official township list.",
        "min_kwp": MIN_KWP, "townships": index}, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    run()
