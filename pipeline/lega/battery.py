"""Battery controller data: the next 72 hours of sun and rain at City of Elmina, plus three SAMPLE
SDP-owned sites. The dispatch rules are mirrored in web/src/lib/battery.ts; both are tested against
shared/battery_cases.json.

Weather: Open-Meteo hourly forecast (shortwave radiation, precipitation). If the call fails, the last
file is kept; if there is none, a synthetic clear/cloudy profile is used. A "storm drill" copy adds a
heavy-rain spell in hours 30-50 so the storm logic can be shown on any day.

Output: web/public/data/battery_72h.json
"""
import json
import math
from datetime import datetime, timezone

import requests

from .config import SITE, WEB_DATA

OUT = WEB_DATA / "battery_72h.json"
CASES = WEB_DATA.parents[2] / "shared" / "battery_cases.json"
URL = "https://api.open-meteo.com/v1/forecast"
PV_DERATE = 0.86 * 0.96          # system losses x inverter (PVWatts-style, flat-ish roof)
HOURS = 72
START_HOUR = 8                   # window starts at 08:00 MYT today
RESERVE, STORM_RESERVE = 0.30, 1.00
STORM_MM_H, STORM_LOOKAHEAD = 10.0, 24
EFF = 0.95                       # one-way charge / discharge efficiency
SITES = [  # SAMPLE sites (annual use sized so each is roughly bill-neutral)
    {"id": "pps", "name": "Dewan Komuniti Elmina (PPS)", "type": "hall", "kwp": 60, "battery_kwh": 200, "annual_kwh": 40_000,
     "note": "Evacuation centre: in an outage it switches to emergency mode (24 h at a higher load)."},
    {"id": "surau", "name": "Surau Elmina Green", "type": "surau", "kwp": 20, "battery_kwh": 60, "annual_kwh": 24_000,
     "note": "Prayer times drive the load: dawn, midday, afternoon and evening."},
    {"id": "guard", "name": "Guardhouse Precinct 3", "type": "guardhouse", "kwp": 5, "battery_kwh": 15, "annual_kwh": 5_500,
     "note": "Flat load all day and night: gate, lights, CCTV."},
]


# ---------------------------------------------------------------- dispatch (mirror battery.ts)
def storm_flags(rain, storm=None):
    """Storm prep when heavy rain (> 10 mm/h) or a storm warning is forecast within the next 24 hours."""
    n = len(rain)
    s = storm or [False] * n
    return [any(rain[j] > STORM_MM_H or s[j] for j in range(h, min(n, h + STORM_LOOKAHEAD + 1))) for h in range(n)]


def dispatch(pv, load, crit, cap, rain, start_soc=0.6, outage_from=None, storm=None):
    """Hourly loop. pv/load/crit in kW (= kWh per hour). Returns per-hour soc, import, export, dark."""
    prep = storm_flags(rain, storm)
    soc = start_soc * cap
    out = {"soc": [], "imp": [], "exp": [], "dark": [], "reserve": [], "served": []}
    for h in range(len(pv)):
        outage = outage_from is not None and h >= outage_from
        ld = crit[h] if outage else load[h]
        reserve = 0.0 if outage else (STORM_RESERVE if prep[h] else RESERVE)
        direct = min(pv[h], ld)
        surplus, deficit = pv[h] - direct, ld - direct
        charge = min(surplus * EFF, cap - soc)
        soc += charge
        exp = 0.0 if outage else surplus - charge / EFF
        imp = 0.0
        # storm prep tops the battery up from the grid too
        if not outage and soc < reserve * cap:
            top = reserve * cap - soc
            soc += top
            imp += top / EFF
        avail = max(0.0, soc - reserve * cap)
        dis = min(deficit / EFF, avail)
        soc -= dis
        unmet = deficit - dis * EFF
        dark = False
        if unmet > 1e-9:
            if outage:
                dark = True
            else:
                imp += unmet
        out["soc"].append(soc / cap)
        out["imp"].append(imp)
        out["exp"].append(max(0.0, exp))
        out["dark"].append(dark)
        out["reserve"].append(reserve)
        out["served"].append(ld - (unmet if dark else 0))
    return out


def hours_until_dark(pv, crit, cap, soc_now, rain, start=0):
    """If the grid fails at `start`: hours the critical load stays on (None = all 72)."""
    r = dispatch(pv, crit, crit, cap, rain, start_soc=soc_now, outage_from=start)
    for h in range(start, len(pv)):
        if r["dark"][h]:
            return h - start
    return None


# ---------------------------------------------------------------- weather
def fetch_live():
    r = requests.get(URL, timeout=60, params={
        "latitude": SITE["lat"], "longitude": SITE["lon"], "hourly": "shortwave_radiation,precipitation,cloud_cover",
        "timezone": SITE["tz"], "forecast_days": 5})
    r.raise_for_status()
    h = r.json()["hourly"]
    from zoneinfo import ZoneInfo
    # the chart always opens at 08:00 today (Malaysia time), at the start of the solar day
    start = datetime.now(ZoneInfo(SITE["tz"])).strftime(f"%Y-%m-%dT{START_HOUR:02d}:00")
    i = h["time"].index(start) if start in h["time"] else 0
    sl = slice(i, i + HOURS)
    return {"time": h["time"][sl], "pv_kw_per_kwp": [round(g / 1000 * PV_DERATE, 3) for g in h["shortwave_radiation"][sl]],
            "rain_mm": [round(x or 0, 1) for x in h["precipitation"][sl]], "cloud_pct": h["cloud_cover"][sl]}


def synthetic(start: str):
    from datetime import timedelta
    t0 = datetime.fromisoformat(start)
    out = {"time": [], "pv_kw_per_kwp": [], "rain_mm": [], "cloud_pct": []}
    for h in range(HOURS):
        t = t0 + timedelta(hours=h)
        sun = max(0.0, math.sin(math.pi * (t.hour + 0.5 - 7) / 12)) if 7 <= t.hour < 19 else 0.0
        out["time"].append(t.strftime("%Y-%m-%dT%H:00"))
        out["pv_kw_per_kwp"].append(round(sun * 0.72, 3))
        out["rain_mm"].append(0.0)
        out["cloud_pct"].append(40)
    return out


def drill(w):
    """Storm drill: heavy rain from hour 30 to 50, sun cut to 12%."""
    d = {k: list(v) for k, v in w.items()}
    for h in range(30, 51):
        d["rain_mm"][h] = round(12 + 10 * math.sin(math.pi * (h - 30) / 20), 1)
        d["pv_kw_per_kwp"][h] = round(d["pv_kw_per_kwp"][h] * 0.12, 3)
        d["cloud_pct"][h] = 100
    return d


def write_cases():
    pv = [0.0] * 6 + [0.5] * 12 + [0.0] * 6
    pv = (pv * 3)[:HOURS]
    load = [2.0] * HOURS
    rain = [0.0] * HOURS
    rain_storm = list(rain)
    rain_storm[40] = 15.0
    cases = []
    for name, rn, outage in [("calm", rain, None), ("storm", rain_storm, None), ("outage", rain, 20)]:
        r = dispatch([p * 10 for p in pv], load, load, 30.0, rn, 0.6, outage)
        cases.append({"name": name, "pv": [p * 10 for p in pv], "load": load, "crit": load, "cap": 30.0, "rain": rn, "start_soc": 0.6,
                      "outage_from": outage, "expected": {k: [round(float(x), 6) if not isinstance(x, bool) else x for x in v] for k, v in r.items()}})
    CASES.write_text(json.dumps({"_note": "Generated by pipeline/lega/battery.py; pytest and web/src/lib/battery.test.ts check both mirrors.",
                                 "cases": cases}, indent=1))


def run():
    status, w = "live", None
    try:
        w = fetch_live()
        if len(w["time"]) < HOURS:
            raise ValueError("short forecast")
    except Exception as ex:  # keep the last file; otherwise synthesise
        print(f"battery: Open-Meteo unavailable ({ex}); ", end="")
        if OUT.exists():
            print("keeping the cached file")
            return
        status = "synthetic"
        from zoneinfo import ZoneInfo
        w = synthetic(datetime.now(ZoneInfo(SITE["tz"])).strftime(f"%Y-%m-%dT{START_HOUR:02d}:00"))
    data = {
        "sample": True, "status": status, "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M+00:00"),
        "source": "Open-Meteo hourly forecast (shortwave radiation, precipitation), City of Elmina" if status == "live" else "synthetic profile",
        "note": "Sites, loads and batteries are SAMPLE values. Weather is the live forecast; the storm drill adds heavy rain in hours 30-50.",
        "rules": {"reserve": RESERVE, "storm_reserve": STORM_RESERVE, "storm_mm_h": STORM_MM_H, "lookahead_h": STORM_LOOKAHEAD,
                  "eff": EFF, "pv_derate": round(PV_DERATE, 3), "second_life_soh": 0.78, "start_soc": 0.6},
        "sites": SITES, "live": w, "drill": drill(w),
    }
    OUT.write_text(json.dumps(data, indent=1))
    write_cases()
    print(f"battery: {status} weather from {w['time'][0]}, max rain {max(w['rain_mm'])} mm/h, "
          f"storm prep in live forecast: {any(storm_flags(w['rain_mm']))}")


if __name__ == "__main__":
    run()
