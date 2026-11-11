"""Orientation study for SDP's Kulai township (Johor, ~1.66°N): annual kWh per kWp for every roof
tilt and direction, so a design-stage planner can show what actually moves the needle.

Weather: NASA POWER HOURLY all-sky GHI, DNI and diffuse (DHI), 2020-2024, cached in data/raw/kulai/.
Model:   pvlib solar position, Perez transposition, SAPM cell temperature, PVWatts DC (-0.37%/°C),
         14% system losses, 96% inverter.
Output:  web/public/data/orientation_lookup.json
"""
import json

import numpy as np
import pandas as pd
import pvlib
import requests

from .config import RAW, SYSTEM, WEB_DATA

KULAI = {"name": "Kulai, Johor", "lat": 1.66, "lon": 103.60, "altitude_m": 40}
CACHE = RAW / "kulai" / "power_hourly.json"
OUT = WEB_DATA / "orientation_lookup.json"
TILTS = list(range(0, 40, 5))
AZIMUTHS = list(range(0, 360, 15))
LOSSES = 0.14
URL = ("https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,"
       "ALLSKY_SFC_SW_DNI,T2M,WS10M&community=RE&longitude={lon}&latitude={lat}&start=20200101&end=20241231&format=JSON&time-standard=UTC")


def weather() -> pd.DataFrame:
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(URL.format(**KULAI), timeout=180)
        r.raise_for_status()
        CACHE.write_text(r.text)
    p = json.loads(CACHE.read_text())["properties"]["parameter"]
    df = pd.DataFrame({"ghi": p["ALLSKY_SFC_SW_DWN"], "dhi": p["ALLSKY_SFC_SW_DIFF"], "dni": p["ALLSKY_SFC_SW_DNI"],
                       "temp": p["T2M"], "wind": p["WS10M"]})
    df.index = pd.to_datetime(df.index, format="%Y%m%d%H", utc=True) + pd.Timedelta(minutes=30)  # hourly means: use mid-hour
    df = df.replace(-999.0, np.nan).interpolate(limit=3).fillna(0)
    return df


def annual_yield(df: pd.DataFrame, sp: pd.DataFrame, tilt: float, az: float) -> float:
    dni_extra = pvlib.irradiance.get_extra_radiation(df.index)
    am = pvlib.atmosphere.get_relative_airmass(sp["apparent_zenith"])
    poa = pvlib.irradiance.get_total_irradiance(tilt, az, sp["apparent_zenith"], sp["azimuth"], df["dni"], df["ghi"], df["dhi"],
                                                dni_extra=dni_extra, airmass=am, model="perez")["poa_global"].fillna(0).clip(lower=0)
    params = pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"]["close_mount_glass_glass"]
    tc = pvlib.temperature.sapm_cell(poa, df["temp"], df["wind"], **params)
    dc = pvlib.pvsystem.pvwatts_dc(poa, tc, 1000, SYSTEM["gamma_pdc"]) * (1 - LOSSES)
    ac = (dc * SYSTEM["inverter_eff"]).clip(upper=1000)
    years = len(df) / 8766
    return float(ac.sum() / 1000 / years)


def run():
    df = weather()
    sp = pvlib.solarposition.get_solarposition(df.index, KULAI["lat"], KULAI["lon"], KULAI["altitude_m"])
    grid = [[round(annual_yield(df, sp, t, a), 1) for a in AZIMUTHS] for t in TILTS]
    g = np.array(grid)
    best = float(g.max())
    i20 = TILTS.index(20)
    az_spread = (g[i20].max() - g[i20].min()) / g[i20].max() * 100
    tilt_spread = (g[:, 0].max() - g[TILTS.index(35)].mean()) / g.max() * 100
    ghi = float(df["ghi"].sum() / 1000 / (len(df) / 8766))
    diffuse = float(df["dhi"].sum() / df["ghi"].sum())
    OUT.write_text(json.dumps({
        "site": KULAI, "method": "NASA POWER hourly 2020-2024 (GHI, DNI, DHI) + pvlib Perez transposition, SAPM cell temperature, "
                                 "PVWatts DC, 14% losses, 96% inverter",
        "ghi_kwh_m2_yr": round(ghi), "diffuse_share": round(diffuse, 3),
        "tilts": TILTS, "azimuths": AZIMUTHS, "kwh_kwp": grid, "best": round(best, 1),
        "azimuth_spread_pct_at_20": round(float(az_spread), 2),
        "tilt_spread_pct": round(float(tilt_spread), 2),
        "flat_kwh_kwp": grid[0][0],
    }, indent=1))
    print(f"Kulai: GHI {ghi:.0f} kWh/m2/yr, diffuse {diffuse:.0%}; best {best:.0f} kWh/kWp; "
          f"direction spread at 20° tilt {az_spread:.1f}%; tilt 35° vs flat {(g[TILTS.index(35)].mean() - g[0, 0]) / g[0, 0] * 100:+.1f}%")
    assert az_spread < 8, "near the equator, roof direction should barely matter"


if __name__ == "__main__":
    run()
