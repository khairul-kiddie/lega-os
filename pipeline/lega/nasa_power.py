"""Download NASA POWER daily point data (community RE), cached to data/raw/."""
import json

import pandas as pd
import requests

from .config import HIST_END, HIST_START, RAW, SITE

PARAMS = {
    "ALLSKY_SFC_SW_DWN": "ghi",       # all-sky GHI, kWh/m2/day
    "CLRSKY_SFC_SW_DWN": "ghi_clear", # clear-sky GHI, kWh/m2/day
    "T2M": "temp",                    # °C
    "RH2M": "rh",                     # %
    "PRECTOTCORR": "precip",          # mm/day
    "CLOUD_AMT": "cloud",             # %
    "WS2M": "wind",                   # m/s
}
URL = "https://power.larc.nasa.gov/api/temporal/daily/point"


def fetch(start: str = HIST_START, end: str = HIST_END, lat: float | None = None, lon: float | None = None) -> dict:
    RAW.mkdir(parents=True, exist_ok=True)
    lat, lon = (SITE["lat"], SITE["lon"]) if lat is None else (lat, lon)
    tag = "" if (lat, lon) == (SITE["lat"], SITE["lon"]) else f"_{lat:.3f}_{lon:.3f}"
    cache = RAW / f"nasa_power_{start}_{end}{tag}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    r = requests.get(URL, timeout=120, params={
        "parameters": ",".join(PARAMS), "community": "RE",
        "latitude": lat, "longitude": lon,
        "start": start.replace("-", ""), "end": end.replace("-", ""), "format": "JSON",
    })
    r.raise_for_status()
    cache.write_text(r.text)
    return r.json()


def load(lat: float | None = None, lon: float | None = None) -> pd.DataFrame:
    raw = fetch(lat=lat, lon=lon)["properties"]["parameter"]
    df = pd.DataFrame({PARAMS[k]: pd.Series(v) for k, v in raw.items()})
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.replace(-999.0, float("nan"))
    df.index.name = "date"
    return df


if __name__ == "__main__":
    d = load()
    print(d.describe().round(2))
    print("missing per column:\n", d.isna().sum())
